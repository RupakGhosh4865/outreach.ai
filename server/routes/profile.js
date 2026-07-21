import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import UserProfile from '../models/UserProfile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const RESUME_OPTIMIZER_URL = process.env.RESUME_OPTIMIZER_URL || 'http://localhost:8002';

// Ensure uploads/ directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const prefix = file.fieldname === 'resume_genai' ? 'genai'
            : file.fieldname === 'resume_backend' ? 'backend'
            : 'resume';
        cb(null, `${prefix}_${Date.now()}${path.extname(file.originalname)}`);
    },
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Only PDF, DOC, DOCX files are allowed'));
    },
    limits: { fileSize: 5 * 1024 * 1024 },
});

const MIME_BY_EXT = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** Real content type for a file we're forwarding, rather than assuming PDF. */
const contentTypeFor = (file) =>
    file?.mimetype || MIME_BY_EXT[path.extname(file?.originalname || '').toLowerCase()] || 'application/octet-stream';

// Accept 3 file slots: resume (main), resume_genai, resume_backend
const uploadFields = upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'resume_genai', maxCount: 1 },
    { name: 'resume_backend', maxCount: 1 },
]);

// POST /api/profile
router.post('/', uploadFields, async (req, res) => {
    try {
        const { name, email, linkedinUrl, githubUrl, portfolioUrl, resumeLink, techStack, experienceYears, experienceMonths, targetRoles } = req.body;
        if (!name || !email) return res.status(400).json({ message: 'Name and email are required.' });

        // The optimizer parses these two slots as PDFs, so reject other formats up front
        // rather than letting the sync fail later with a confusing error.
        for (const field of ['resume_genai', 'resume_backend']) {
            const file = req.files?.[field]?.[0];
            if (file && path.extname(file.originalname).toLowerCase() !== '.pdf') {
                return res.status(400).json({
                    message: `${field === 'resume_genai' ? 'Gen AI' : 'Backend'} resume must be a PDF — the optimizer cannot read Word files.`,
                });
            }
        }

        let profile = await UserProfile.findOne({ email });

        const updateData = {
            name, email, linkedinUrl, githubUrl, portfolioUrl, resumeLink, techStack,
            experienceYears: experienceYears ? parseInt(experienceYears) : 0,
            experienceMonths: experienceMonths ? parseInt(experienceMonths) : 0,
            targetRoles,
        };

        // ── Main resume (fallback attachment)
        const mainFile = req.files?.resume?.[0];
        if (mainFile) {
            if (profile?.resumePath && fs.existsSync(profile.resumePath)) fs.unlinkSync(profile.resumePath);
            updateData.resumePath = mainFile.path;
            updateData.resumeOriginalName = mainFile.originalname;
        }

        // ── GenAI resume
        const genaiFile = req.files?.resume_genai?.[0];
        if (genaiFile) {
            if (profile?.resumeGenaiPath && fs.existsSync(profile.resumeGenaiPath)) fs.unlinkSync(profile.resumeGenaiPath);
            updateData.resumeGenaiPath = genaiFile.path;
            updateData.resumeGenaiName = genaiFile.originalname;
        }

        // ── Backend resume
        const backendFile = req.files?.resume_backend?.[0];
        if (backendFile) {
            if (profile?.resumeBackendPath && fs.existsSync(profile.resumeBackendPath)) fs.unlinkSync(profile.resumeBackendPath);
            updateData.resumeBackendPath = backendFile.path;
            updateData.resumeBackendName = backendFile.originalname;
        }

        if (profile) { Object.assign(profile, updateData); await profile.save(); }
        else { profile = await UserProfile.create(updateData); }

        // ── Forward optimizer resumes to Python FastAPI (non-fatal)
        const srcGenai   = genaiFile   || (profile.resumeGenaiPath   && fs.existsSync(profile.resumeGenaiPath)   ? { path: profile.resumeGenaiPath,   originalname: profile.resumeGenaiName   } : null);
        const srcBackend = backendFile  || (profile.resumeBackendPath && fs.existsSync(profile.resumeBackendPath) ? { path: profile.resumeBackendPath,  originalname: profile.resumeBackendName } : null);

        let optimizerSyncError = null;
        if (srcGenai || srcBackend) {
            try {
                const fd = new FormData();
                if (srcGenai)   fd.append('resume_genai',   fs.createReadStream(srcGenai.path),   { filename: srcGenai.originalname,   contentType: contentTypeFor(srcGenai) });
                if (srcBackend) fd.append('resume_backend',  fs.createReadStream(srcBackend.path),  { filename: srcBackend.originalname,  contentType: contentTypeFor(srcBackend) });
                await axios.post(`${RESUME_OPTIMIZER_URL}/api/save-defaults`, fd, { headers: fd.getHeaders(), timeout: 20000 });
                console.log(`[Profile] Optimizer resumes synced for ${email}`);
            } catch (optErr) {
                optimizerSyncError = optErr.response?.data?.detail
                    || (optErr.code === 'ECONNREFUSED'
                        ? `Resume Optimizer service is not running at ${RESUME_OPTIMIZER_URL}.`
                        : optErr.message);
                console.warn('[Profile] Optimizer sync failed:', optimizerSyncError);
            }
        }

        // The profile itself saved fine; the optimizer sync is reported so the UI can warn
        // instead of showing an unqualified success.
        res.status(200).json({
            message: optimizerSyncError
                ? 'Profile saved, but the Resume Optimizer could not be updated.'
                : 'Profile saved successfully.',
            profile,
            optimizerSyncError,
        });
    } catch (err) {
        console.error('Profile save error:', err);
        res.status(500).json({ message: err.message || 'Error saving profile.' });
    }
});

// GET /api/profile?email=xxx
router.get('/', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ message: 'Email query param required.' });
        const profile = await UserProfile.findOne({ email });
        if (!profile) return res.status(404).json({ message: 'Profile not found.' });
        if (!profile.subscription?.plan) {
            profile.subscription = { plan: 'free', status: 'active', campaignsUsed: 0, lastResetDate: new Date() };
        }
        res.json({ profile });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
