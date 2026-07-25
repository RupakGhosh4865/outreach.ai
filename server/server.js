import 'dotenv/config';
import dns from 'dns';
// Override DNS servers to Google's public DNS — fixes SRV record lookups on Windows/home routers
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { validateEnv, allowedOrigins } from './config/env.js';

// Configuration is checked before anything else boots.
validateEnv();

import profileRouter from './routes/profile.js';
import jobsRouter, { initScheduledSendService } from './routes/jobs.js';
import jobSearchRouter from './routes/jobSearch.js';
import applicationsRouter from './routes/applications.js';
import jobSourcesRouter from './routes/jobSources.js';
import jobRadarRouter from './routes/jobRadar.js';
import authRouter from './routes/auth.js';
import { sweepInterruptedSteps } from './services/applicationFsm.js';
import passport from './config/passport.js';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { initReminderService } from './services/reminderService.js';
import { initReplyTrackingService } from './services/replyTrackingService.js';
import { requireAuth, currentEmail } from './middleware/auth.js';
import UserProfile from './models/UserProfile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === 'production';

// ─── Middleware ──────────────────────────────────────────────────────────────
app.set('trust proxy', 1); // behind a reverse proxy: correct client IPs for rate limiting
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const origins = allowedOrigins();
app.use(cors({
    origin: (origin, cb) => {
        // Same-origin/curl requests have no Origin header and are not CORS.
        if (!origin || origins.includes(origin)) return cb(null, true);
        cb(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Session is only used to carry the OAuth handshake; tokens do the real work.
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    // The default MemoryStore leaks and cannot be shared between replicas.
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URL, ttl: 60 * 60 }),
    cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 60 * 60 * 1000 },
}));
app.use(passport.initialize());
app.use(passport.session());

// ─── Rate limiting ───────────────────────────────────────────────────────────
const limiter = (windowMs, max, message) => rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
});

app.use('/api/', limiter(15 * 60 * 1000, 600, 'Too many requests — slow down.'));
app.use('/api/auth', limiter(15 * 60 * 1000, 40, 'Too many sign-in attempts. Try again shortly.'));
// These fan out to paid APIs (OpenAI, Hunter, job boards) and headless Chrome.
const expensive = limiter(60 * 60 * 1000, 60, 'You have hit the hourly limit for AI actions. Try again later.');
app.use('/api/jobs/autopilot', expensive);
app.use('/api/jobs/optimize-resume', expensive);
app.use('/api/jobs/analyze-fit', expensive);
app.use('/api/job-radar/scan', limiter(60 * 60 * 1000, 6, 'Only a few radar scans per hour are allowed.'));

// ─── Request logging ─────────────────────────────────────────────────────────
// Bodies are deliberately not logged: they carry resumes, email content and
// contact details, and this used to write all of it to stdout.
app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms`);
    });
    next();
});

// ─── Uploads ─────────────────────────────────────────────────────────────────
// Resumes are private. They were previously served by express.static with
// guessable filenames, so anyone could enumerate and download them.
const uploadsDir = path.join(__dirname, 'uploads');
app.get('/uploads/:filename', requireAuth, async (req, res) => {
    const profile = await UserProfile.findOne({ email: currentEmail(req) });
    if (!profile) return res.status(404).json({ message: 'Not found.' });

    const requested = path.join(uploadsDir, path.basename(req.params.filename));
    const owned = [profile.resumePath, profile.resumeGenaiPath, profile.resumeBackendPath]
        .filter(Boolean)
        .map((p) => path.resolve(p));

    if (!owned.includes(path.resolve(requested)) || !fs.existsSync(requested)) {
        return res.status(404).json({ message: 'Not found.' });
    }
    res.sendFile(requested);
});

// ─── MongoDB ─────────────────────────────────────────────────────────────────
async function connectMongo(retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            await mongoose.connect(process.env.MONGODB_URL, {
                serverSelectionTimeoutMS: 15000,
                socketTimeoutMS: 45000,
                family: 4, // Force IPv4 — fixes DNS SRV resolution on many Windows/home routers
            });
            console.log('✅ Connected to MongoDB');
            // Pipelines that were mid-flight when the process died can't resume themselves.
            await sweepInterruptedSteps().catch((err) => console.error('[FSM] Sweep failed:', err.message));
            return;
        } catch (err) {
            console.error(`❌ MongoDB attempt ${i + 1}/${retries} failed:`, err.message);
            if (i < retries - 1) {
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }
    // Serving requests without a database means every route 500s while the
    // process still looks healthy to the orchestrator. Exit so it restarts us.
    console.error('❌ Could not connect to MongoDB. Check the Atlas IP allowlist at cloud.mongodb.com → Network Access.');
    process.exit(1);
}

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/profile', profileRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/job-search', jobSearchRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/job-sources', jobSourcesRouter);
app.use('/api/job-radar', jobRadarRouter);
app.use('/api/auth', authRouter);

// Health check — used by container/orchestrator probes.
app.get('/api/health', (req, res) => {
    const mongoUp = mongoose.connection.readyState === 1;
    res.status(mongoUp ? 200 : 503).json({
        status: mongoUp ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        mongoState: mongoUp ? 'connected' : 'disconnected',
    });
});

// 404 for unknown API routes, so the client gets JSON rather than HTML.
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found.' }));

// Express 5 forwards async errors here.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error('[Unhandled]', err);
    res.status(status).json({
        message: status >= 500 && isProd ? 'Something went wrong.' : err.message,
    });
});

// ─── Startup ─────────────────────────────────────────────────────────────────
async function start() {
    await connectMongo();

    initReminderService();
    initScheduledSendService();
    if (process.env.ENABLE_REPLY_TRACKING === 'true') initReplyTrackingService();

    const server = app.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
    });

    // Finish in-flight requests before exiting so a deploy doesn't cut a send short.
    for (const signal of ['SIGTERM', 'SIGINT']) {
        process.on(signal, () => {
            console.log(`\n${signal} received — shutting down.`);
            server.close(() => mongoose.connection.close(false).then(() => process.exit(0)));
            setTimeout(() => process.exit(1), 10000).unref();
        });
    }
}

start();
