import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import UserProfile from '../models/UserProfile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Ensure uploads/ directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const safeName = `resume_${Date.now()}${path.extname(file.originalname)}`;
        cb(null, safeName);
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
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// POST /api/profile — create or update profile + resume upload
router.post('/', upload.single('resume'), async (req, res) => {
    try {
        const { name, email, linkedinUrl, githubUrl, portfolioUrl, techStack, experienceYears, targetRoles } = req.body;
        if (!name || !email) {
            return res.status(400).json({ message: 'Name and email are required.' });
        }

        let profile = await UserProfile.findOne({ email });

        const updateData = {
            name,
            email,
            linkedinUrl,
            githubUrl,
            portfolioUrl,
            techStack,
            experienceYears: experienceYears ? parseInt(experienceYears) : 0,
            targetRoles
        };
        if (req.file) {
            // Delete old resume file if it exists
            if (profile?.resumePath && fs.existsSync(profile.resumePath)) {
                fs.unlinkSync(profile.resumePath);
            }
            updateData.resumePath = req.file.path;
            updateData.resumeOriginalName = req.file.originalname;
        }

        if (profile) {
            Object.assign(profile, updateData);
            await profile.save();
        } else {
            profile = await UserProfile.create(updateData);
        }

        res.status(200).json({ message: 'Profile saved successfully.', profile });
    } catch (err) {
        console.error('Profile save error:', err);
        res.status(500).json({ message: err.message || 'Error saving profile.' });
    }
});

// GET /api/profile?email=xxx — fetch profile by email
router.get('/', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ message: 'Email query param required.' });
        const profile = await UserProfile.findOne({ email });
        if (!profile) return res.status(404).json({ message: 'Profile not found.' });

        // Ensure subscription exists (backwards compatibility)
        if (!profile.subscription || !profile.subscription.plan) {
            profile.subscription = {
                plan: 'free',
                status: 'active',
                campaignsUsed: 0,
                lastResetDate: new Date()
            };
        }

        res.json({ profile });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
