import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { renderResumePdf, resumeToText } from './pdfRenderer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TMP_RESUME_DIR = path.join(__dirname, '..', 'tmp', 'resumes');
if (!fs.existsSync(TMP_RESUME_DIR)) fs.mkdirSync(TMP_RESUME_DIR, { recursive: true });

const RESUME_OPTIMIZER_URL = process.env.RESUME_OPTIMIZER_URL || 'http://localhost:8002';

/** Pull the most useful message out of an axios/FastAPI failure. */
export function describeAxiosError(err) {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (detail) return JSON.stringify(detail);

    const data = err?.response?.data;
    if (typeof data === 'string' && data.trim()) return data.slice(0, 400);
    if (Buffer.isBuffer(data)) {
        const text = data.toString('utf-8').slice(0, 400);
        try { return JSON.parse(text).detail || text; } catch { return text; }
    }
    if (err?.response?.status) return `${err.response.status} ${err.response.statusText || ''}`.trim();
    if (err?.code === 'ECONNREFUSED') {
        return `Resume Optimizer service is not reachable at ${RESUME_OPTIMIZER_URL}. Start it with "npm run dev" in ResumeOptimiser/backend.`;
    }
    return err?.message || 'Unknown error';
}

/**
 * Extract text from a PDF buffer.
 *
 * pdf-parse v2 exports a `PDFParse` class, not a callable. The previous code
 * invoked the module as a function, which threw on every call — and because the
 * only caller swallowed the error and returned '', every resume in the system
 * silently parsed as empty. Keep this the single place that knows the PDF API.
 *
 * @throws if the buffer is not a readable PDF
 */
export async function extractPdfText(buffer) {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
        const { text } = await parser.getText();
        return text || '';
    } finally {
        await parser.destroy?.().catch?.(() => { /* already released */ });
    }
}

/** Extract text from an uploaded PDF resume (empty string on failure, with a log). */
export async function parseResume(resumePath) {
    try {
        const text = await extractPdfText(fs.readFileSync(resumePath));
        if (!text.trim()) {
            console.warn(`[parseResume] ${path.basename(resumePath)} produced no text — is it a scanned image?`);
        }
        return text.slice(0, 4000);
    } catch (err) {
        console.error(`[parseResume] Could not read ${resumePath}:`, err.message);
        return '';
    }
}

/** Condense a UserProfile into the summary the optimizer uses as source material. */
export function profileSummary(profile) {
    if (!profile) return '';
    const links = [
        profile.linkedinUrl && `LinkedIn: ${profile.linkedinUrl}`,
        profile.githubUrl && `GitHub: ${profile.githubUrl}`,
        profile.portfolioUrl && `Portfolio: ${profile.portfolioUrl}`,
    ].filter(Boolean);

    return [
        profile.name && `Name: ${profile.name}`,
        profile.email && `Email: ${profile.email}`,
        profile.techStack && `Tech stack: ${profile.techStack}`,
        (profile.experienceYears || profile.experienceMonths) &&
            `Experience: ${profile.experienceYears || 0} years ${profile.experienceMonths || 0} months`,
        profile.targetRoles && `Target roles: ${profile.targetRoles}`,
        ...links,
    ].filter(Boolean).join('\n');
}

// ── Optimization cache: coalesces concurrent calls and lets the UI reuse
// results computed by the pipeline/send (and vice versa) for the same JD+user.
const optimCache = new Map(); // key -> { status, promise, result, error, createdAt }
const OPTIM_TTL_MS = 30 * 60 * 1000;

export const optimKey = (jd, userEmail = '') =>
    crypto.createHash('sha256').update(`${userEmail}::${jd.trim().toLowerCase()}`).digest('hex').slice(0, 16);

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of optimCache) {
        if (now - entry.createdAt > OPTIM_TTL_MS) {
            if (entry.result?.pdfPath) {
                try { fs.unlinkSync(entry.result.pdfPath); }
                catch (err) {
                    if (err.code !== 'ENOENT') console.warn('[ResumeCache] Could not remove PDF:', err.message);
                }
            }
            optimCache.delete(key);
        }
    }
}, 5 * 60 * 1000).unref();

export const getCacheEntry = (key) => optimCache.get(key);

/**
 * Build a job-matched resume: JSON from the Python optimizer, PDF via Puppeteer.
 *
 * Never throws — always resolves to { ok: true, ...result } or { ok: false, error }
 * so callers can record the real reason instead of silently falling back.
 */
export async function buildOptimizedResume({ jobDescription, profile, outPath }) {
    try {
        let resumeText = '';
        if (profile?.resumePath && fs.existsSync(profile.resumePath)) {
            resumeText = await parseResume(profile.resumePath);
        }
        if (!resumeText && profile?.resumeGenaiPath && fs.existsSync(profile.resumeGenaiPath)) {
            resumeText = await parseResume(profile.resumeGenaiPath);
        }

        const { data } = await axios.post(
            `${RESUME_OPTIMIZER_URL}/api/resume-json`,
            {
                job_description: jobDescription,
                resume_text: resumeText || undefined,
                profile_summary: profileSummary(profile) || undefined,
                // Scopes the optimizer's saved-resume fallback to this account.
                // Without it the optimizer would fall back to another user's resume.
                user_email: profile?.email || undefined,
            },
            { timeout: 120000 }
        );

        if (!data?.resume) throw new Error('Optimizer returned no resume content.');

        // Make sure the contact block reflects the user's real profile.
        const resume = { ...data.resume };
        resume.name = resume.name || profile?.name || '';
        resume.email = resume.email || profile?.email || '';
        const knownLinks = [
            profile?.linkedinUrl && { label: 'LinkedIn', url: profile.linkedinUrl },
            profile?.githubUrl && { label: 'GitHub', url: profile.githubUrl },
            profile?.portfolioUrl && { label: 'Portfolio', url: profile.portfolioUrl },
        ].filter(Boolean);
        if (knownLinks.length) resume.links = knownLinks;

        const pdfPath = outPath || path.join(TMP_RESUME_DIR, `optimized_${Date.now()}.pdf`);
        await renderResumePdf(resume, pdfPath);

        const matchScore = Number(data.match_score) || 0;
        console.log(`[Resume] Built job-matched resume (score ${matchScore}, source ${data.source}) → ${path.basename(pdfPath)}`);

        return {
            ok: true,
            pdfPath,
            resume,
            resumeText: resumeToText(resume),
            matchScore,
            source: data.source,
            addedKeywords: data.added_keywords || [],
            removedKeywords: data.removed_keywords || [],
            atsTips: data.ats_tips || [],
            projectSuggestions: data.project_suggestions || [],
        };
    } catch (err) {
        const error = describeAxiosError(err);
        console.error('[Resume] Optimization failed:', error);
        return { ok: false, error };
    }
}

/** Cached wrapper around buildOptimizedResume, keyed on (user, job description). */
export function getOptimizedResumeForJob(jobDescription, profile) {
    const key = optimKey(jobDescription, profile?.email);
    const cached = optimCache.get(key);
    if (cached) {
        if (cached.status === 'pending') return cached.promise;
        if (cached.status === 'done' && Date.now() - cached.createdAt < OPTIM_TTL_MS
            && cached.result?.pdfPath && fs.existsSync(cached.result.pdfPath)) {
            return Promise.resolve(cached.result);
        }
        optimCache.delete(key);
    }

    // userEmail is recorded so the HTTP layer can refuse to serve one user's
    // optimized CV to another account.
    const entry = {
        status: 'pending',
        promise: null,
        result: null,
        error: null,
        createdAt: Date.now(),
        userEmail: profile?.email || null,
    };
    entry.promise = buildOptimizedResume({ jobDescription, profile }).then((result) => {
        entry.status = result.ok ? 'done' : 'failed';
        entry.result = result.ok ? result : null;
        entry.error = result.ok ? null : result.error;
        return result;
    });
    optimCache.set(key, entry);
    return entry.promise;
}
