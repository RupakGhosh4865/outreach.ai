import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import crypto from 'crypto';

import JobSearchCache from '../models/JobSearchCache.js';
import { chatJson } from '../services/llm.js';
import { requireAuth } from '../middleware/auth.js';
import { searchAdzuna, searchJSearch } from '../services/jobSources/boards.js';

const router = express.Router();

// Both routes spend LLM and third-party API quota, so neither is anonymous.
router.use(requireAuth);

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Extract role/keywords/seniority from raw JD text. */
async function extractRoleFromJd(jdText) {
    return chatJson({
        system: 'You turn a job description into the query a person would actually type into a job board.',
        user: `Job description:
"${jdText.slice(0, 6000)}"

role: the concise job title to search for, as job boards phrase it (e.g. "Backend Engineer", not "Backend Engineer III, Payments Platform").
keywords: up to 5 key skills or technologies, most distinguishing first.
seniority: one of junior, mid, senior, lead, unknown.`,
        schema: {
            type: 'object',
            properties: {
                role: { type: 'string' },
                keywords: { type: 'array', items: { type: 'string' } },
                seniority: { type: 'string', enum: ['junior', 'mid', 'senior', 'lead', 'unknown'] },
            },
            required: ['role', 'keywords', 'seniority'],
            additionalProperties: false,
        },
        schemaName: 'job_query',
        maxTokens: 300,
        label: 'extract-role',
    });
}

// POST /api/job-search/extract — { jdText } → { role, keywords, seniority }
router.post('/extract', async (req, res) => {
    try {
        const { jdText } = req.body;
        if (!jdText?.trim()) return res.status(400).json({ message: 'jdText is required' });
        res.json(await extractRoleFromJd(jdText));
    } catch (err) {
        console.error('[JobSearch] extract error:', err.message);
        res.status(500).json({ message: 'Failed to extract role from job description' });
    }
});

// POST /api/job-search/uk — { role?, keywords?, jdText? } → merged UK listings
router.post('/uk', async (req, res) => {
    try {
        let { role, keywords, jdText } = req.body;
        if (!role && jdText?.trim()) {
            const extracted = await extractRoleFromJd(jdText);
            role = extracted.role;
            keywords = keywords?.length ? keywords : extracted.keywords;
        }
        if (!role?.trim()) return res.status(400).json({ message: 'Provide a role or jdText' });
        keywords = Array.isArray(keywords) ? keywords : [];

        const queryHash = crypto.createHash('sha256')
            .update(`${role}|${[...keywords].sort().join(',')}`.toLowerCase())
            .digest('hex');

        const cachedDoc = await JobSearchCache.findOne({ queryHash }).lean();
        if (cachedDoc) {
            return res.json({
                query: { role, keywords },
                jobs: cachedDoc.results,
                sources: { adzuna: 'cached', jsearch: 'cached' },
                cached: true,
            });
        }

        const hasAdzuna = !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
        const hasJSearch = !!process.env.RAPIDAPI_KEY;
        if (!hasAdzuna && !hasJSearch) {
            return res.status(503).json({
                message: 'No job search API keys configured. Set ADZUNA_APP_ID/ADZUNA_APP_KEY and/or RAPIDAPI_KEY in server/.env',
            });
        }

        // Connectors are shared with the radar (services/jobSources/boards.js);
        // this route used to carry a second, drifting copy of both.
        const tasks = [
            hasAdzuna ? searchAdzuna({ role, keywords }) : Promise.reject(new Error('no key')),
            hasJSearch ? searchJSearch({ role }) : Promise.reject(new Error('no key')),
        ];
        const [adzunaRes, jsearchRes] = await Promise.allSettled(tasks);

        const sources = {
            adzuna: !hasAdzuna ? 'skipped (no key)' : adzunaRes.status === 'fulfilled' ? adzunaRes.value.length : 'failed',
            jsearch: !hasJSearch ? 'skipped (no key)' : jsearchRes.status === 'fulfilled' ? jsearchRes.value.length : 'failed',
        };
        if (adzunaRes.status === 'rejected' && hasAdzuna) console.error('[JobSearch] Adzuna failed:', adzunaRes.reason?.message);
        if (jsearchRes.status === 'rejected' && hasJSearch) console.error('[JobSearch] JSearch failed:', jsearchRes.reason?.message);

        // Merge + dedupe by title|company, keeping the longer description
        const merged = new Map();
        for (const job of [
            ...(adzunaRes.status === 'fulfilled' ? adzunaRes.value : []),
            ...(jsearchRes.status === 'fulfilled' ? jsearchRes.value : []),
        ]) {
            const key = `${norm(job.title)}|${norm(job.company)}`;
            const existing = merged.get(key);
            if (!existing || (job.description?.length || 0) > (existing.description?.length || 0)) {
                merged.set(key, job);
            }
        }

        const jobs = [...merged.values()]
            .sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0))
            .slice(0, 40);

        if (jobs.length > 0) {
            await JobSearchCache.findOneAndUpdate(
                { queryHash },
                { queryHash, role, keywords, results: jobs, createdAt: new Date() },
                { upsert: true }
            ).catch((e) => console.error('[JobSearch] cache save failed:', e.message));
        }

        res.json({ query: { role, keywords }, jobs, sources, cached: false });
    } catch (err) {
        console.error('[JobSearch] uk error:', err.message);
        res.status(500).json({ message: 'Job search failed' });
    }
});

export default router;
