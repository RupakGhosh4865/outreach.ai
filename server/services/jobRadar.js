import 'dotenv/config';
import { chatJson, isQuotaError } from './llm.js';

import ScanRun from '../models/ScanRun.js';
import DiscoveredJob from '../models/DiscoveredJob.js';
import UserProfile from '../models/UserProfile.js';
import { parseResume, profileSummary } from './resume.js';
import { acquireLock, releaseLock, isLocked } from './lock.js';

import { safeSearch } from './jobSources/shared.js';
import { searchAdzuna, searchJSearch } from './jobSources/boards.js';
import { searchLinkedIn } from './jobSources/linkedin.js';
import { searchIndeed } from './jobSources/indeed.js';
import { searchGlassdoor } from './jobSources/glassdoor.js';
import { searchWellfound } from './jobSources/wellfound.js';
import { searchGoogleJobs } from './jobSources/googleJobs.js';
import { searchGitHub } from './jobSources/github.js';
import { searchCouncils } from './jobSources/councils.js';

export const ALL_SOURCES =['adzuna', 'jsearch', 'linkedin', 'indeed', 'glassdoor', 'wellfound', 'google', 'github', 'council'];
const MAX_SCORED_PER_SCAN = 60;
const SCORE_BATCH = 5;

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// One scan per user at a time, enforced across replicas by the Mongo lock.
const localScans = new Map(); // userEmail -> Promise
const scanLockKey = (userEmail) => `radar-scan:${userEmail}`;

/** Expand the user's target roles into adjacent search titles (one LLM call). */
async function expandRoles(targetRoles) {
    const base = String(targetRoles || '').split(/[,;\/]/).map((s) => s.trim()).filter(Boolean);
    if (!base.length) return [];
    try {
        const { roles = [] } = await chatJson({
            system: 'You expand job titles into closely-related titles that job boards actually use.',
            user: `Target roles: ${base.join(', ')}

Return the original titles first, then close variants a recruiter would post under (e.g. Business Analyst -> Data Analyst, Finance Analyst). Use titles that appear in real job postings, not invented ones. Max 5 total.`,
            schema: {
                type: 'object',
                properties: { roles: { type: 'array', items: { type: 'string' } } },
                required: ['roles'],
                additionalProperties: false,
            },
            schemaName: 'expanded_roles',
            maxTokens: 300,
            label: 'expand-roles',
        });
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

    const { scores = [] } = await chatJson({
        system: [
            'You are an ATS matcher. You score how well ONE candidate fits EACH job.',
            'Be honest and use the full range: most real matches land between 30 and 70.',
            'Reserve 80+ for candidates who clearly meet the stated must-haves, and score below 30 when the domain or seniority is plainly wrong.',
        ].join(' '),
        user: `CANDIDATE RESUME:
${(resumeText || '').slice(0, 3000) || '(no resume text)'}

CANDIDATE PROFILE:
${summary || '(none)'}

JOBS:
${jobsBlock}

Return one entry per job, in the same order, using the bracketed index shown above.
matchedSkills: skills the candidate demonstrably has that this job asks for (max 6).
missingSkills: must-haves the job asks for that the candidate does not evidence (max 4).`,
        schema: {
            type: 'object',
            properties: {
                scores: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            index: { type: 'integer' },
                            matchScore: { type: 'integer' },
                            matchedSkills: { type: 'array', items: { type: 'string' } },
                            missingSkills: { type: 'array', items: { type: 'string' } },
                            summary: { type: 'string' },
                        },
                        required: ['index', 'matchScore', 'matchedSkills', 'missingSkills', 'summary'],
                        additionalProperties: false,
                    },
                },
            },
            required: ['scores'],
            additionalProperties: false,
        },
        schemaName: 'job_scores',
        maxTokens: 1800,
        label: 'score-batch',
    });

    const byIndex = new Map(scores.map((s) => [s.index, s]));
    return jobs.map((_, i) => byIndex.get(i) || null);
}

/**
 * Update one source's row on a scan.
 *
 * Connectors run concurrently, so this must not be a load-mutate-save on a
 * shared Mongoose document: several finishing at once triggered
 * ParallelSaveError and killed the whole scan. A positional update touches only
 * that source's fields, so concurrent writers can't collide or clobber each
 * other's status.
 */
async function setSource(scanId, name, patch) {
    const $set = {};
    for (const [key, value] of Object.entries(patch)) {
        // `undefined` is not a valid $set value; store an explicit null instead.
        $set[`sources.$.${key}`] = value === undefined ? null : value;
    }
    await ScanRun.updateOne({ _id: scanId, 'sources.name': name }, { $set });
}

/** Patch top-level scan fields atomically, for the same reason. */
const patchScan = (scanId, $set) => ScanRun.updateOne({ _id: scanId }, { $set });

/**
 * Persist a batch of scraped jobs and ATS-score them.
 *
 * Called once per phase rather than once at the end. Councils can take up to 15
 * minutes, and holding the fast sources' results in memory until they finished
 * meant the UI sat on "Scanning…" with an empty list even though 100+ jobs had
 * already been found.
 *
 * @returns {Promise<number>} how many jobs were scored in this batch
 */
async function persistAndScore({ scanId, userEmail, jobs, roles, resumeText, summary }) {
    // Dedupe within the batch, preferring the richest description.
    const merged = new Map();
    for (const job of jobs) {
        const key = job.applyUrl || `${norm(job.title)}|${norm(job.company)}`;
        const existing = merged.get(key);
        if (!existing || (job.description?.length || 0) > (existing.description?.length || 0)) merged.set(key, job);
    }

    const dismissed = new Set(
        (await DiscoveredJob.find({ userEmail, status: 'dismissed' }).select('applyUrl').lean())
            .map((d) => d.applyUrl).filter(Boolean)
    );

    const docs = [];
    for (const job of merged.values()) {
        if (job.applyUrl && dismissed.has(job.applyUrl)) continue;
        const query = job.applyUrl
            ? { userEmail, applyUrl: job.applyUrl }
            : { userEmail, title: job.title, company: job.company };
        const doc = await DiscoveredJob.findOneAndUpdate(
            query,
            { $set: { ...job, userEmail }, $setOnInsert: { status: 'new', discoveredAt: new Date() } },
            { upsert: true, new: true }
        ).catch((e) => { console.warn('[Radar] upsert failed:', e.message); return null; });
        if (doc) docs.push(doc);
    }

    // Jobs are now queryable, so the UI can show them while scoring continues.
    await ScanRun.updateOne({ _id: scanId }, { $inc: { totalFound: docs.length } });

    const toScore = docs
        .filter((d) => d.matchScore == null && roughlyRelevant(d, roles))
        .slice(0, MAX_SCORED_PER_SCAN);

    let scored = 0;
    for (let i = 0; i < toScore.length; i += SCORE_BATCH) {
        const batch = toScore.slice(i, i + SCORE_BATCH);
        try {
            const scores = await scoreBatch(batch, resumeText, summary);
            // Distinct documents, so saving them together is safe.
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
            scored += batch.length;
            await ScanRun.updateOne({ _id: scanId }, { $inc: { totalScored: batch.length } });
        } catch (err) {
            // Out of LLM quota, or a transient failure: the jobs are already
            // saved, they simply stay unscored rather than sinking the scan.
            console.warn('[Radar] scoring batch failed:', err.message);
            if (isQuotaError(err)) {
                console.warn('[Radar] skipping remaining scoring for this scan — no LLM quota.');
                break;
            }
        }
    }

    return scored;
}

async function execute(scanId) {
    const scan = await ScanRun.findById(scanId);
    if (!scan) throw new Error(`Scan ${scanId} no longer exists.`);
    const profile = await UserProfile.findOne({ email: scan.userEmail });
    const roles = scan.roles;
    const primaryRole = roles[0];
    const userEmail = scan.userEmail;

    // Resume text is read once and reused by every scoring batch.
    let resumeText = '';
    if (profile?.resumePath) resumeText = await parseResume(profile.resumePath);
    const summary = profileSummary(profile);
    const scoreArgs = { scanId, userEmail, roles, resumeText, summary };

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
    let totalScored = 0;

    const fastNames = Object.keys(connectors).filter((n) => active.includes(n));
    for (const name of fastNames) await setSource(scanId, name, { status: 'running' });

    const fastResults = await Promise.all(fastNames.map(async (name) => {
        const result = await safeSearch(name, connectors[name]);
        await setSource(scanId, name, {
            status: result.ok ? 'done' : 'failed',
            found: result.jobs.length,
            error: result.error,
        });
        return result.jobs;
    }));

    // Save these now — councils below can run for another 15 minutes.
    totalScored += await persistAndScore({ ...scoreArgs, jobs: fastResults.flat() });

    // ── 2. Councils (slow, batched, with live progress) ──
    if (active.includes('council')) {
        await setSource(scanId, 'council', { status: 'running' });
        const result = await safeSearch('council', () => searchCouncils({
            roles,
            onProgress: (p) => patchScan(scanId, {
                councilProgress: { done: p.done, total: p.total, unreachable: p.unreachable.slice(0, 40) },
            }),
        }), 15 * 60 * 1000); // councils get a much larger budget
        await setSource(scanId, 'council', {
            status: result.ok ? 'done' : 'failed',
            found: result.jobs.length,
            error: result.error,
        });
        totalScored += await persistAndScore({ ...scoreArgs, jobs: result.jobs });
    }

    const finalCounts = await ScanRun.findById(scanId).select('totalFound totalScored').lean();
    await patchScan(scanId, { status: 'done', finishedAt: new Date() });
    console.log(`[Radar] Scan ${scanId} done: ${finalCounts?.totalFound ?? 0} found, ${finalCounts?.totalScored ?? 0} scored.`);
}

/** Start a scan for a user. Rejects if one is already running. */
export async function startScan({ userEmail, sources }) {
    // Councils alone can run ~15 minutes, so the lock gets a generous TTL.
    if (!(await acquireLock(scanLockKey(userEmail), { ttlMs: 45 * 60 * 1000 }))) {
        throw Object.assign(new Error('A scan is already running for this user.'), { status: 409 });
    }

    try {
        return await beginScan({ userEmail, sources });
    } catch (err) {
        await releaseLock(scanLockKey(userEmail)); // nothing was started
        throw err;
    }
}

async function beginScan({ userEmail, sources }) {
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
        .finally(async () => {
            localScans.delete(userEmail);
            await releaseLock(scanLockKey(userEmail));
        });
    localScans.set(userEmail, promise);

    return scan;
}

export const isScanning = async (userEmail) =>
    localScans.has(userEmail) || isLocked(scanLockKey(userEmail));
