import 'dotenv/config';
import dns from 'dns';
// Override DNS servers to Google's public DNS — fixes SRV record lookups on Windows/home routers
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';


import profileRouter from './routes/profile.js';
import jobsRouter from './routes/jobs.js';
import jobSearchRouter from './routes/jobSearch.js';
import applicationsRouter from './routes/applications.js';
import jobSourcesRouter from './routes/jobSources.js';
import jobRadarRouter from './routes/jobRadar.js';
import authRouter from './routes/auth.js';
import { sweepInterruptedSteps } from './services/applicationFsm.js';
import passport from './config/passport.js';
import session from 'express-session';
import { initReminderService } from './services/reminderService.js';
// import { initReplyTrackingService } from './services/replyTrackingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:3001'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('  Body:', JSON.stringify(req.body).slice(0, 500));
  }
  next();
});

// Serve uploaded files (resumes)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── MongoDB ─────────────────────────────────────────────────────────────────
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
  console.error('❌ Could not connect to MongoDB. Check Atlas IP Whitelist at cloud.mongodb.com → Network Access → Add IP 0.0.0.0/0');
}

connectMongo();

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/profile', profileRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/job-search', jobSearchRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/job-sources', jobSourcesRouter);
app.use('/api/job-radar', jobRadarRouter);
app.use('/api/auth', authRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongoState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// Initialize background services
initReminderService();
// initReplyTrackingService();

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});