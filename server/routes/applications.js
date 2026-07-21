import express from 'express';
import fs from 'fs';

import JobApplication from '../models/JobApplication.js';
import { transition, IllegalTransitionError } from '../services/applicationFsm.js';
import { runPipeline, retryFrom, sendDraft, isRunning } from '../services/pipeline.js';

const router = express.Router();

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        const status = err instanceof IllegalTransitionError ? err.status : 500;
        if (status === 500) console.error('[Applications]', err);
        res.status(status).json({ message: err.message });
    }
};

const withRunning = (app) => ({ ...app.toObject(), isRunning: isRunning(app._id) });

async function loadApp(req) {
    const app = await JobApplication.findById(req.params.id);
    if (!app) {
        const err = new Error('Application not found.');
        err.status = 404;
        throw err;
    }
    return app;
}

// GET /api/applications?userEmail=&status=
router.get('/', handle(async (req, res) => {
    const { userEmail, status } = req.query;
    if (!userEmail) return res.status(400).json({ message: 'userEmail is required.' });

    const query = { userEmail };
    if (status) query.status = { $in: String(status).split(',') };

    const applications = await JobApplication.find(query).sort({ updatedAt: -1 }).limit(100);
    res.json({ applications: applications.map(withRunning) });
}));

// GET /api/applications/:id — polled by the pipeline stepper
router.get('/:id', handle(async (req, res) => {
    const app = await loadApp(req);
    res.json({ application: withRunning(app) });
}));

// POST /api/applications/:id/apply-clicked — user opened the company's site
router.post('/:id/apply-clicked', handle(async (req, res) => {
    const app = await loadApp(req);
    await transition(app, 'applying', { appliedAt: new Date() });
    res.json({ application: withRunning(app) });
}));

// POST /api/applications/:id/approve — user finished applying; start the pipeline
router.post('/:id/approve', handle(async (req, res) => {
    const app = await loadApp(req);
    const { autoSend, emailType, extraContext } = req.body || {};

    await transition(app, 'approved', {
        approvedAt: new Date(),
        ...(autoSend !== undefined ? { autoSend: Boolean(autoSend) } : {}),
        ...(emailType ? { emailType } : {}),
        ...(extraContext !== undefined ? { extraContext } : {}),
    });

    runPipeline(app._id); // runs in the background; the UI polls GET /:id
    res.json({ application: withRunning(app), message: 'Approved — building your job-matched CV.' });
}));

// POST /api/applications/:id/deny
router.post('/:id/deny', handle(async (req, res) => {
    const app = await loadApp(req);
    await transition(app, 'denied', { deniedAt: new Date() });
    res.json({ application: withRunning(app) });
}));

// POST /api/applications/:id/retry — re-run a failed step and everything after it
router.post('/:id/retry', handle(async (req, res) => {
    const app = await loadApp(req);
    const step = req.body?.step || app.steps.find((s) => s.status === 'error')?.name;
    if (!step) return res.status(400).json({ message: 'No failed step to retry.' });

    retryFrom(app, step);
    res.json({ message: `Retrying "${step}".`, application: withRunning(app) });
}));

// POST /api/applications/:id/send — Review & Send from the drafted email
router.post('/:id/send', handle(async (req, res) => {
    const app = await loadApp(req);
    if (!['email_drafted', 'contacts_found', 'email_failed'].includes(app.status)) {
        return res.status(409).json({ message: `Application is "${app.status}" — there is no draft ready to send.` });
    }

    const result = await sendDraft(app, req.body || {});
    const refreshed = await JobApplication.findById(app._id);
    res.json({
        message: result.attachmentStatus === 'missing'
            ? `Sent to ${result.sentTo.length} recipient(s) — no resume was attached (none available).`
            : `Sent to ${result.sentTo.length} recipient(s).`,
        ...result,
        application: withRunning(refreshed),
    });
}));

// GET /api/applications/:id/cv — download the generated CV
router.get('/:id/cv', handle(async (req, res) => {
    const app = await loadApp(req);
    if (!app.cv?.pdfPath || !fs.existsSync(app.cv.pdfPath)) {
        return res.status(404).json({ message: 'No generated CV available for this application.' });
    }
    res.setHeader('Content-Disposition', `inline; filename="CV_${(app.companyName || 'Application').replace(/[^\w-]+/g, '_')}.pdf"`);
    res.sendFile(app.cv.pdfPath);
}));

// DELETE /api/applications/:id
router.delete('/:id', handle(async (req, res) => {
    const app = await loadApp(req);
    if (app.cv?.pdfPath) {
        try { fs.unlinkSync(app.cv.pdfPath); }
        catch (err) { if (err.code !== 'ENOENT') console.warn('[Applications] Could not remove CV:', err.message); }
    }
    await app.deleteOne();
    res.json({ message: 'Application removed.' });
}));

export default router;
