import express from 'express';
import fs from 'fs';

import JobApplication from '../models/JobApplication.js';
import { transition, canTransition, IllegalTransitionError } from '../services/applicationFsm.js';
import { runPipeline, retryFrom, sendDraft, isRunning } from '../services/pipeline.js';
import { requireAuth, currentEmail, loadOwnedApplication } from '../middleware/auth.js';

const router = express.Router();

// Every route below operates on the caller's own applications.
router.use(requireAuth);

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        const status = err.status || (err instanceof IllegalTransitionError ? err.status : 500);
        if (status === 500) console.error('[Applications]', err);
        res.status(status).json({ message: err.message });
    }
};

const withRunning = async (app) => ({ ...app.toObject(), isRunning: await isRunning(app._id) });

const loadApp = loadOwnedApplication;

// GET /api/applications?status=
router.get('/', handle(async (req, res) => {
    const { status } = req.query;
    const query = { userEmail: currentEmail(req) };
    if (status) query.status = { $in: String(status).split(',') };

    const applications = await JobApplication.find(query).sort({ updatedAt: -1 }).limit(100);
    res.json({ applications: await Promise.all(applications.map(withRunning)) });
}));

// GET /api/applications/:id — polled by the pipeline stepper
router.get('/:id', handle(async (req, res) => {
    const app = await loadApp(req);
    res.json({ application: await withRunning(app) });
}));

// POST /api/applications/:id/apply-clicked — user opened the company's site
router.post('/:id/apply-clicked', handle(async (req, res) => {
    const app = await loadApp(req);
    await transition(app, 'applying', { appliedAt: new Date() });
    res.json({ application: await withRunning(app) });
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
    res.json({ application: await withRunning(app), message: 'Approved — building your job-matched CV.' });
}));

// POST /api/applications/:id/deny
router.post('/:id/deny', handle(async (req, res) => {
    const app = await loadApp(req);
    await transition(app, 'denied', { deniedAt: new Date() });
    res.json({ application: await withRunning(app) });
}));

// POST /api/applications/:id/retry — re-run a failed step and everything after it
router.post('/:id/retry', handle(async (req, res) => {
    const app = await loadApp(req);
    const step = req.body?.step || app.steps.find((s) => s.status === 'error')?.name;
    if (!step) return res.status(400).json({ message: 'No failed step to retry.' });

    retryFrom(app, step);
    res.json({ message: `Retrying "${step}".`, application: await withRunning(app) });
}));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// POST /api/applications/:id/contacts — add a recipient by hand
//
// Contact discovery fails often (small companies, no public addresses), and the
// pipeline's own error text told the user to "add a recipient manually to
// continue" while offering no way to do it. Without this the application is
// stuck: retrying discovery just fails the same way.
router.post('/:id/contacts', handle(async (req, res) => {
    const app = await loadApp(req);

    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if ((app.contacts || []).some((c) => (c.email || '').toLowerCase() === email)) {
        return res.status(409).json({ message: `${email} is already a recipient on this application.` });
    }
    if (app.status === 'emailed') {
        return res.status(409).json({ message: 'This application has already been sent.' });
    }

    app.contacts.push({
        firstName: String(req.body?.firstName || '').trim(),
        lastName: String(req.body?.lastName || '').trim(),
        email,
        position: String(req.body?.position || '').trim() || 'Hiring Manager',
        source: 'manual',
    });

    // Only a *failed* discovery step is unstuck by this. A pending one means the
    // pipeline is still working its way there — resuming from the email step
    // would race the CV build that is still running.
    const findStep = app.steps.find((s) => s.name === 'find_contacts');
    const wasStuck = findStep?.status === 'error';

    if (wasStuck) {
        findStep.status = 'done';
        findStep.error = undefined;
        findStep.finishedAt = new Date();
    }
    await app.save();

    if (wasStuck) {
        if (canTransition(app.status, 'contacts_found')) await transition(app, 'contacts_found');
        // Background; the UI polls GET /:id. Errors land on the step itself, but
        // catch here too so a rejection can't take the process down.
        retryFrom(app, 'generate_email')
            .catch((err) => console.error('[Applications] Resume after manual contact failed:', err.message));
    }

    res.json({
        message: wasStuck
            ? `Added ${email} — writing the outreach email now.`
            : `Added ${email} as a recipient.`,
        application: await withRunning(app),
    });
}));

// DELETE /api/applications/:id/contacts/:email — drop a recipient
router.delete('/:id/contacts/:email', handle(async (req, res) => {
    const app = await loadApp(req);
    if (app.status === 'emailed') {
        return res.status(409).json({ message: 'This application has already been sent.' });
    }

    const email = decodeURIComponent(req.params.email).toLowerCase();
    const before = app.contacts.length;
    app.contacts = app.contacts.filter((c) => (c.email || '').toLowerCase() !== email);
    if (app.contacts.length === before) {
        return res.status(404).json({ message: 'That recipient is not on this application.' });
    }

    await app.save();
    res.json({ message: `Removed ${email}.`, application: await withRunning(app) });
}));

// POST /api/applications/:id/send — Review & Send from the drafted email
router.post('/:id/send', handle(async (req, res) => {
    const app = await loadApp(req);
    if (!['email_drafted', 'email_failed'].includes(app.status)) {
        return res.status(409).json({ message: `Application is "${app.status}" — there is no draft ready to send.` });
    }

    // "contacts_found" used to be accepted here, but the draft is written by the
    // *next* step — so sending from that state mailed an empty body.
    const body = req.body?.body ?? app.email?.body;
    const subject = req.body?.subject ?? app.email?.subject;
    if (!body?.trim() || !subject?.trim()) {
        return res.status(409).json({ message: 'This application has no drafted subject and body to send.' });
    }

    const result = await sendDraft(app, req.body || {});
    const refreshed = await JobApplication.findById(app._id);
    res.json({
        message: result.attachmentStatus === 'missing'
            ? `Sent to ${result.sentTo.length} recipient(s) — no resume was attached (none available).`
            : `Sent to ${result.sentTo.length} recipient(s).`,
        ...result,
        application: await withRunning(refreshed),
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
