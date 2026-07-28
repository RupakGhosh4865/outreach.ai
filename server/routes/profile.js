import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import UserProfile from '../models/UserProfile.js';
import { requireAuth, currentEmail } from '../middleware/auth.js';
import { ensurePdf } from '../services/documentConvert.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.use(requireAuth);
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

/**
 * Content type of a file we're forwarding, taken from the path actually stored
 * on disk. Word uploads are converted to PDF before this runs, so the stored
 * extension — not the user's original filename — is the truthful source.
 */
const contentTypeFor = (file) =>
    MIME_BY_EXT[path.extname(file?.path || '').toLowerCase()] || 'application/octet-stream';

/** Filename to forward alongside a stored file, matching its real extension. */
const forwardNameFor = (file) =>
    `${path.basename(file.originalname || 'resume', path.extname(file.originalname || ''))}${path.extname(file.path)}`;

// Accept 3 file slots: resume (main), resume_genai, resume_backend
const uploadFields = upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'resume_genai', maxCount: 1 },
    { name: 'resume_backend', maxCount: 1 },
]);

// POST /api/profile
router.post('/', uploadFields, async (req, res) => {
    try {
        const { name, linkedinUrl, githubUrl, portfolioUrl, resumeLink, techStack, experienceYears, experienceMonths, targetRoles, teamMembers } = req.body;

        // The account is whoever the token says it is. Taking `email` from the
        // body let any caller overwrite any other user's profile — and the UI
        // exposed the field for editing.
        const email = currentEmail(req);
        if (!name) return res.status(400).json({ message: 'Name is required.' });

        // Word uploads are converted to PDF here so every downstream reader
        // (text extraction, the optimizer, email attachments) keeps its
        // PDF-only assumption. `originalname` is left alone — the UI still
        // shows the user the filename they picked.
        for (const field of ['resume', 'resume_genai', 'resume_backend']) {
            const file = req.files?.[field]?.[0];
            if (!file) continue;
            try {
                const { path: storedPath } = await ensurePdf(file);
                file.path = storedPath;
            } catch (convErr) {
                console.error(`[Profile] Word conversion failed for ${field}:`, convErr.message);
                return res.status(400).json({
                    message: `Could not read "${file.originalname}". Please re-save it as a PDF and upload again.`,
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

        // Sent as a JSON string because the rest of the form is multipart.
        // Names are deduplicated case-insensitively so History's per-person
        // counts can't be split by "Ansh" vs "ansh".
        if (teamMembers !== undefined) {
            let parsed;
            try { parsed = JSON.parse(teamMembers); }
            catch { return res.status(400).json({ message: 'teamMembers must be a JSON array.' }); }
            if (!Array.isArray(parsed)) return res.status(400).json({ message: 'teamMembers must be a JSON array.' });

            const seen = new Set();
            updateData.teamMembers = parsed
                .map((m) => String(typeof m === 'string' ? m : m?.name || '').trim())
                .filter((n) => {
                    const key = n.toLowerCase();
                    if (!n || n.length > 60 || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                })
                .slice(0, 20)
                .map((n) => ({ name: n }));
        }

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
        //
        // The main resume is included: it is the slot every user fills in, and
        // excluding it meant an account with only a main resume had no layout
        // template, so every tailor request 404'd into the generic builder.
        const resolveSrc = (uploaded, pathField, nameField) =>
            uploaded || (profile[pathField] && fs.existsSync(profile[pathField])
                ? { path: profile[pathField], originalname: profile[nameField] }
                : null);

        const sources = {
            resume_main:    resolveSrc(mainFile,    'resumePath',        'resumeOriginalName'),
            resume_genai:   resolveSrc(genaiFile,   'resumeGenaiPath',   'resumeGenaiName'),
            resume_backend: resolveSrc(backendFile, 'resumeBackendPath', 'resumeBackendName'),
        };

        let optimizerSyncError = null;
        if (Object.values(sources).some(Boolean)) {
            try {
                const fd = new FormData();
                // Scopes these defaults to one account in the optimizer's store.
                fd.append('user_email', profile.email);
                for (const [field, src] of Object.entries(sources)) {
                    if (!src) continue;
                    fd.append(field, fs.createReadStream(src.path), {
                        filename: forwardNameFor(src),
                        contentType: contentTypeFor(src),
                    });
                }
                await axios.post(`${RESUME_OPTIMIZER_URL}/api/save-defaults`, fd, { headers: fd.getHeaders(), timeout: 30000 });
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

// ── Resume slots ────────────────────────────────────────────────────────────

// Slot name → the profile fields it owns. `variant` is the optimizer's own key
// for the slot, which stays 'genai'/'backend' on the Python side even though
// the UI now calls them Resume 1 and Resume 2.
const RESUME_SLOTS = {
    main:    { pathField: 'resumePath',        nameField: 'resumeOriginalName', variant: 'main' },
    genai:   { pathField: 'resumeGenaiPath',   nameField: 'resumeGenaiName',    variant: 'genai' },
    backend: { pathField: 'resumeBackendPath', nameField: 'resumeBackendName',  variant: 'backend' },
};

// DELETE /api/profile/resume/:slot — remove an uploaded resume so it can be replaced
router.delete('/resume/:slot', async (req, res) => {
    try {
        const slot = RESUME_SLOTS[req.params.slot];
        if (!slot) return res.status(400).json({ message: 'Unknown resume slot.' });

        const email = currentEmail(req);
        const profile = await UserProfile.findOne({ email });
        if (!profile) return res.status(404).json({ message: 'Profile not found.' });

        const filePath = profile[slot.pathField];
        if (filePath) {
            try { fs.unlinkSync(filePath); }
            catch (err) {
                // Already gone is fine — the point is that it isn't referenced any more.
                if (err.code !== 'ENOENT') console.warn('[Profile] Could not delete resume file:', err.message);
            }
        }

        profile[slot.pathField] = null;
        profile[slot.nameField] = null;
        await profile.save();

        // Drop the optimizer's cached copy too, otherwise it would keep
        // tailoring CVs from a resume the user just removed.
        let optimizerSyncError = null;
        if (slot.variant) {
            try {
                await axios.delete(`${RESUME_OPTIMIZER_URL}/api/clear-default`, {
                    params: { user_email: email, variant: slot.variant },
                    timeout: 20000,
                });
            } catch (optErr) {
                optimizerSyncError = optErr.response?.data?.detail
                    || (optErr.code === 'ECONNREFUSED'
                        ? `Resume Optimizer service is not running at ${RESUME_OPTIMIZER_URL}.`
                        : optErr.message);
                console.warn('[Profile] Optimizer clear failed:', optimizerSyncError);
            }
        }

        res.json({ message: 'Resume removed.', profile, optimizerSyncError });
    } catch (err) {
        console.error('Resume delete error:', err);
        res.status(500).json({ message: err.message || 'Error removing resume.' });
    }
});

// GET /api/profile — always the authenticated user's own profile
router.get('/', async (req, res) => {
    try {
        const email = currentEmail(req);
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
