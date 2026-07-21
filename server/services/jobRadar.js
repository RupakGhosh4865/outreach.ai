import 'dotenv/config';
import Groq from 'groq-sdk';

import ScanRun from '../models/ScanRun.js';
import DiscoveredJob from '../models/DiscoveredJob.js';
import UserProfile from '../models/UserProfile.js';
import { parseResume, profileSummary } from './resume.js';

import { safeSearch } from './jobSources/shared.js';
import { searchAdzuna, searchJSearch } from './jobSources/boards.js';
import { searchLinkedIn } from './jobSources/linkedin.js';
import { searchIndeed } from './jobSources/indeed.js';
import { searchGlassdoor } from './jobSources/glassdoor.js';
import { searchWellfound } from './jobSources/wellfound.js';
import { searchGoogleJobs } from './jobSources/googleJobs.js';
import { searchGitHub } from './jobSources/github.js';
import { searchCouncils } from './jobSources/councils.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const ALL_SOURCES = ['adzuna', 'jsearch', 'linkedin', 'indeed', 'glassdoor', 'wellfound', 'google', 'github', 'council'];
const MAX_SCORED_PER_SCAN = 60;
const SCORE_BATCH = 5;

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// One scan per user at a time.
const running = new Map(); // userEmail -> Promise

/** Expand the user's target roles into adjacent search titles (one Groq call). */
async function expandRoles(targetRoles) {
    const base = String(targetRoles || '').split(/[,;\/]/).map((s) => s.trim()).filter(Boolean);
    if (!base.length) return [];
    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: 'You expand job titles into closely-related search titles. JSON only.' },
                { role: 'user', content: `Target roles: ${base.join(', ')}\n\nReturn JSON: { "roles": ["up to 5 job titles, the originals first, then close variants (e.g. Business Analyst -> Data Analyst, Finance Analyst)"] }` },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 300,
        });
        const roles = JSON.parse(completion.choices[0].message.content).roles || [];
        return [...new Set([...base, ...roles])].slice(0, 5);
    } catch (err) {
        console.warn('[Radar] role expansion failed:', err.message);
        return base;
    }
}

/** Cheap local pre-filter so we only spend scoring calls on plausible matches. */
function roughlyRelevant(job, roles) {
    const text = `${job.title} ${job.description}`.toLowerCase();
    return roles.some((role) => {
        const words = role.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        return words.some((w) => text.includes(w));
    });
}

/** Score a batch of jobs against the user's resume/profile in one LLM call. */
async function scoreBatch(jobs, resumeText, summary) {
    const jobsBlock = jobs.map((j, i) =>
        `[${i}] ${j.title} at ${j.company} (${j.location})\n${(j.description || '').slice(0, 900)}`
    ).join('\n\n---\n\n');

    const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            {
                role: 'system',
                content: 'You are an ATS matcher. Score how well ONE candidate fits EACH job. JSON only. Be honest — most jobs score 30-70.',
            },
            {
                role: 'user',
                content: `CANDIDATE RESUME:
${(resumeText || '').slice(0, 3000) || '(no resume text)'}

CANDIDATE PROFILE:
${summary || '(none)'}

JOBS:
${jobsBlock}

Return JSON: { "scores": [{ "index": 0, "matchScore": 0-100, "matchedSkills": ["max 6"], "missingSkills": ["max 4"], "summary": "one sentence on fit" }] } — one entry per job, in order.`,
            },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1800,
        temperature: 0.2,
    });

    const scores = JSON.parse(completion.choices[0].message.content).scores || [];
    const byIndex = new Map(scores.map((s) => [s.index, s]));
    return jobs.map((_, i) => byIndex.get(i) || null);
}

async function setSource(scan, name, patch) {
    const entry = scan.sources.find((s) => s.name === name);
    if (entry) Object.assign(entry, patch);
    await scan.save();
}

async function execute(scanId) {
    const scan = await ScanRun.findById(scanId);
    const profile = await UserProfile.findOne({ email: scan.userEmail });
    const roles = scan.roles;
    const primaryRole = roles[0];

    // ── 1. Fast/API sources in parallel (one query per source using the primary
    //       role; JSearch additionally covers the expanded roles since it's cheap) ──
    const connectors = {
        adzuna: () => searchAdzuna({ role: primaryRole, keywords: roles.slice(1) }),
        jsearch: async () => (await Promise.all(roles.slice(0, 3).map((role) => searchJSearch({ role }).catch(() => [])))).flat(),
        linkedin: () => searchLinkedIn({ role: primaryRole }),
        indeed: () => searchIndeed({ role: primaryRole }),
        glassdoor: () => searchGlassdoor({ role: primaryRole }),
        wellfound: () => searchWellfound({ role: primaryRole }),
        google: () => searchGoogleJobs({ role: primaryRole }),
        github: () => searchGitHub({ role: primaryRole }),
    };

    const active = scan.sources.map((s) => s.name);
    const found = [];

    const fastNames = Object.keys(connectors).filter((n) => active.includes(n));
    for (const name of fastNames) await setSource(scan, name, { status: 'running' });

    const fastResults = await Promise.all(fastNames.map(async (name) => {
        const result = await safeSearch(name, connectors[name]);
        await setSource(scan, name, {
            status: result.ok ? 'done' : 'failed',
            found: result.jobs.length,
            error: result.error,
        });
        return result.jobs;
    }));
    found.push(...fastResults.flat());

    // ── 2. Councils (slow, batched, with live progress) ──
    if (active.includes('council')) {
        await setSource(scan, 'council', { status: 'running' });
        const result = await safeSearch('council', () => searchCouncils({
            roles,
            onProgress: async (p) => {
                scan.councilProgress = { done: p.done, total: p.total, unreachable: p.unreachable.slice(0, 40) };
                await scan.save();
            },
        }), 15 * 60 * 1000); // councils get a much larger budget
        await setSource(scan, 'council', {
            status: result.ok ? 'done' : 'failed',
            found: result.jobs.length,
            error: result.error,
        });
        found.push(...result.jobs);
    }

    // ── 3. Merge, dedupe, upsert ──
    const merged = new Map();
    for (const job of found) {
        const key = job.applyUrl || `${norm(job.title)}|${norm(job.company)}`;
        const existing = merged.get(key);
        if (!existing || (job.description?.length || 0) > (existing.description?.length || 0)) merged.set(key, job);
    }

    const dismissed = new Set(
        (await DiscoveredJob.find({ userEmail: scan.userEmail, status: 'dismissed' }).select('applyUrl').lean())
            .map((d) => d.applyUrl).filter(Boolean)
    );

    const docs = [];
    for (const job of merged.values()) {
        if (job.applyUrl && dismissed.has(job.applyUrl)) continue;
        const query = job.applyUrl
            ? { userEmail: scan.userEmail, applyUrl: job.applyUrl }
            : { userEmail: scan.userEmail, title: job.title, company: job.company };
        const doc = await DiscoveredJob.findOneAndUpdate(
            query,
            { $set: { ...job, userEmail: scan.userEmail }, $setOnInsert: { status: 'new', discoveredAt: new Date() } },
            { upsert: true, new: true }
        ).catch((e) => { console.warn('[Radar] upsert failed:', e.message); return null; });
        if (doc) docs.push(doc);
    }

    scan.totalFound = docs.length;
    await scan.save();

    // ── 4. ATS scoring, batched, relevance-filtered, capped ──
    let resumeText = '';
    if (profile?.resumePath) resumeText = await parseResume(profile.resumePath);
    const summary = profileSummary(profile);

    const toScore = docs
        .filter((d) => d.matchScore == null && roughlyRelevant(d, roles))
        .slice(0, MAX_SCORED_PER_SCAN);

    for (let i = 0; i < toScore.length; i += SCORE_BATCH) {
        const batch = toScore.slice(i, i + SCORE_BATCH);
        try {
            const scores = await scoreBatch(batch, resumeText, summary);
            await Promise.all(batch.map((doc, idx) => {
                const s = scores[idx];
                if (!s) return null;
                doc.matchScore = Math.max(0, Math.min(100, Number(s.matchScore) || 0));
                doc.matchedSkills = (s.matchedSkills || []).slice(0, 6);
                doc.missingSkills = (s.missingSkills || []).slice(0, 4);
                doc.matchSummary = s.summary || '';
                doc.scoredAt = new Date();
                return doc.save();
            }));
            scan.totalScored = Math.min(i + SCORE_BATCH, toScore.length);
            await scan.save();
        } catch (err) {
            console.warn('[Radar] scoring batch failed:', err.message);
        }
    }

    scan.status = 'done';
    scan.finishedAt = new Date();
    await scan.save();
    console.log(`[Radar] Scan ${scan._id} done: ${scan.totalFound} found, ${scan.totalScored} scored.`);
}

/** Start a scan for a user. Rejects if one is already running. */
export async function startScan({ userEmail, sources }) {
    if (running.has(userEmail)) throw Object.assign(new Error('A scan is already running for this user.'), { status: 409 });

    const profile = await UserProfile.findOne({ email: userEmail });
    if (!profile) throw Object.assign(new Error('Profile not found — set up your profile (with target roles) first.'), { status: 404 });
    if (!profile.targetRoles?.trim()) {
        throw Object.assign(new Error('No target roles set. Add roles like "Business Analyst" to your profile first.'), { status: 400 });
    }

    const roles = await expandRoles(profile.targetRoles);
    const selected = (sources?.length ? sources : ALL_SOURCES).filter((s) => ALL_SOURCES.includes(s));

    const scan = await ScanRun.create({
        userEmail,
        roles,
        sources: selected.map((name) => ({ name, status: 'pending' })),
        councilProgress: { done: 0, total: selected.includes('council') ? 118 : 0, unreachable: [] },
    });

    const promise = execute(scan._id)
        .catch(async (err) => {
            console.error('[Radar] scan crashed:', err);
            await ScanRun.findByIdAndUpdate(scan._id, { status: 'failed', error: err.message, finishedAt: new Date() });
        })
        .finally(() => running.delete(userEmail));
    running.set(userEmail, promise);

    return scan;
}

export const isScanning = (userEmail) => running.has(userEmail);
