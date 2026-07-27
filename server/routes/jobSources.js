import express from 'express';
import multer from 'multer';
import path from 'path';

import JobApplication from '../models/JobApplication.js';
import { ingestJobUrl, ingestJobText, extractUrls } from '../services/scrape.js';
import { extractPdfText } from '../services/resume.js';
import { requireAuth, currentEmail } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.txt', '.csv', '.docx'];
        if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
        else cb(new Error('Upload a PDF, DOCX, TXT or CSV of job links / descriptions.'));
    },
});

/** Pull text out of an uploaded document so we can find job links or a JD inside it. */
async function textFromUpload(file) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.txt' || ext === '.csv') return file.buffer.toString('utf-8');

    if (ext === '.pdf') return extractPdfText(file.buffer);

    if (ext === '.docx') {
        const { default: mammoth } = await import('mammoth');
        return (await mammoth.extractRawText({ buffer: file.buffer })).value;
    }

    return '';
}

/** Create or refresh the application for one scraped job. */
export async function upsertApplication(userEmail, job, source) {
    const applyUrl = job.applyUrl || '';
    const fields = {
        userEmail,
        source,
        jobTitle: job.jobTitle || '',
        companyName: job.companyName || '',
        location: job.location || '',
        jobDescription: job.jobDescription || '',
        applyUrl,
        applyMethod: job.applyMethod || 'unknown',
        validation: job.validation,
        status: 'ready',
        // Starts the clock the moment a job enters the pipeline, so History can
        // report how long the whole apply took.
        applyStartedAt: new Date(),
    };

    if (applyUrl) {
        const existing = await JobApplication.findOne({ userEmail, applyUrl });
        if (existing) {
            // Don't clobber an application the user has already acted on.
            if (['found', 'validating', 'ready'].includes(existing.status)) {
                // Keep the original start time — re-ingesting the same job is
                // part of the same attempt, so the clock shouldn't restart.
                Object.assign(existing, { ...fields, applyStartedAt: existing.applyStartedAt || fields.applyStartedAt });
                await existing.save();
            }
            return existing;
        }
    }

    return JobApplication.create(fields);
}

// POST /api/job-sources/ingest — urls[], text, and/or an uploaded document
router.post('/ingest', upload.single('document'), async (req, res) => {
    try {
        const userEmail = currentEmail(req);

        let urls = req.body.urls || [];
        if (typeof urls === 'string') urls = extractUrls(urls);

        const pastedText = req.body.text || '';
        let documentText = '';
        if (req.file) documentText = await textFromUpload(req.file);

        // Links found in the pasted text or the document are jobs to scrape.
        urls = [...new Set([...urls, ...extractUrls(pastedText), ...extractUrls(documentText)])];

        const applications = [];
        const errors = [];

        for (const url of urls) {
            try {
                const job = await ingestJobUrl(url);
                applications.push(await upsertApplication(userEmail, job, 'user-link'));
            } catch (err) {
                console.error(`[Ingest] ${url} failed:`, err.message);
                errors.push({ url, error: err.message });
            }
        }

        // A pasted JD (or a document with no links) becomes a job on its own.
        const standaloneText = [pastedText, documentText]
            .filter((t) => t && extractUrls(t).length === 0)
            .join('\n\n')
            .trim();

        if (standaloneText.length > 100) {
            const job = await ingestJobText(standaloneText);
            applications.push(await upsertApplication(userEmail, job, req.file ? 'document' : 'manual'));
        }

        if (!applications.length && !errors.length) {
            return res.status(400).json({ message: 'Nothing to ingest — provide job links, a job description, or a document.' });
        }

        res.json({
            applications,
            errors,
            message: `Ingested ${applications.length} job(s).`,
        });
    } catch (err) {
        console.error('[Ingest] error:', err);
        res.status(500).json({ message: err.message });
    }
});

// POST /api/job-sources/from-search — adopt a job already structured by UK search
router.post('/from-search', async (req, res) => {
    try {
        const { job } = req.body;
        if (!job?.applyUrl) {
            return res.status(400).json({ message: 'job.applyUrl is required.' });
        }

        const application = await upsertApplication(currentEmail(req), {
            jobTitle: job.title || job.jobTitle || '',
            companyName: job.company || job.companyName || '',
            location: job.location || '',
            jobDescription: job.description || job.jobDescription || '',
            applyUrl: job.applyUrl,
            applyMethod: 'external',
            validation: { status: 'open', reason: 'From a live job-board search.', checkedAt: new Date() },
        }, 'uk-search');

        res.json({ application });
    } catch (err) {
        console.error('[Ingest from-search] error:', err);
        res.status(500).json({ message: err.message });
    }
});

// POST /api/job-sources/:id/validate — re-check whether a job is still open
router.post('/:id/validate', async (req, res) => {
    try {
        const app = await JobApplication.findOne({ _id: req.params.id, userEmail: currentEmail(req) });
        if (!app) return res.status(404).json({ message: 'Application not found.' });
        if (!app.applyUrl) return res.status(400).json({ message: 'This job has no URL to re-check.' });

        const job = await ingestJobUrl(app.applyUrl);
        app.validation = job.validation;
        if (job.jobDescription) app.jobDescription = job.jobDescription;
        await app.save();

        res.json({ application: app });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
