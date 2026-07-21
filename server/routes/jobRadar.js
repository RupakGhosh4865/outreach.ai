import express from 'express';

import DiscoveredJob from '../models/DiscoveredJob.js';
import ScanRun from '../models/ScanRun.js';
import { startScan, isScanning, ALL_SOURCES } from '../services/jobRadar.js';
import { upsertApplication } from './jobSources.js';

const router = express.Router();

// POST /api/job-radar/scan — { userEmail, sources? }
router.post('/scan', async (req, res) => {
    try {
        const { userEmail, sources } = req.body;
        if (!userEmail) return res.status(400).json({ message: 'userEmail is required.' });
        const scan = await startScan({ userEmail, sources });
        res.status(202).json({ scanId: scan._id, roles: scan.roles, message: 'Scan started.' });
    } catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});

// GET /api/job-radar/scan/:id — polled progress
router.get('/scan/:id', async (req, res) => {
    try {
        const scan = await ScanRun.findById(req.params.id).lean();
        if (!scan) return res.status(404).json({ message: 'Scan not found.' });
        res.json({ scan: { ...scan, isScanning: isScanning(scan.userEmail) } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/job-radar/jobs?userEmail=&minScore=&source=&status=
router.get('/jobs', async (req, res) => {
    try {
        const { userEmail, minScore, source, status } = req.query;
        if (!userEmail) return res.status(400).json({ message: 'userEmail is required.' });

        const query = { userEmail };
        query.status = status ? { $in: String(status).split(',') } : { $ne: 'dismissed' };
        if (source) query.source = { $in: String(source).split(',') };
        if (minScore) query.matchScore = { $gte: Number(minScore) };

        const jobs = await DiscoveredJob.find(query)
            .sort({ matchScore: -1, discoveredAt: -1 })
            .limit(200)
            .lean();
        res.json({ jobs });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

const setStatus = (status) => async (req, res) => {
    try {
        const job = await DiscoveredJob.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!job) return res.status(404).json({ message: 'Job not found.' });
        res.json({ job });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

router.post('/jobs/:id/shortlist', setStatus('shortlisted'));
router.post('/jobs/:id/dismiss', setStatus('dismissed'));

// POST /api/job-radar/jobs/:id/to-pipeline — hand a discovered job to the Apply/CV pipeline
router.post('/jobs/:id/to-pipeline', async (req, res) => {
    try {
        const job = await DiscoveredJob.findById(req.params.id);
        if (!job) return res.status(404).json({ message: 'Job not found.' });

        const application = await upsertApplication(job.userEmail, {
            jobTitle: job.title,
            companyName: job.company,
            location: job.location,
            jobDescription: job.description,
            applyUrl: job.applyUrl,
            applyMethod: 'external',
            validation: { status: 'open', reason: `Discovered via ${job.source} radar scan.`, checkedAt: new Date() },
        }, 'uk-search');

        job.status = 'in_pipeline';
        job.applicationId = application._id;
        await job.save();

        res.json({ job, application });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/job-radar/sources — for the UI checkboxes
router.get('/sources', (req, res) => res.json({ sources: ALL_SOURCES }));

export default router;
