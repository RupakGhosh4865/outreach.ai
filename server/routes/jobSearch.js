import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import Groq from 'groq-sdk';

import JobSearchCache from '../models/JobSearchCache.js';

const router = express.Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Extract role/keywords/seniority from raw JD text via Groq */
async function extractRoleFromJd(jdText) {
    const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            {
                role: 'system',
                content: 'You extract structured job-search queries from job descriptions. Respond only with JSON.',
            },
            {
                role: 'user',
                content: `Job description:
"${jdText.slice(0, 6000)}"

Extract a job-search query as JSON:
{
  "role": "the concise job title to search for, e.g. 'Backend Engineer'",
  "keywords": ["up to 5 key skills/technologies"],
  "seniority": "junior|mid|senior|lead|unknown"
}
ONLY return the JSON object.`,
            },
        ],
        response_format: { type: 'json_object' },
    });
    return JSON.parse(completion.choices[0].message.content);
}

async function searchAdzuna(role, keywords) {
    const { data } = await axios.get('https://api.adzuna.com/v1/api/jobs/gb/search/1', {
        params: {
            app_id: process.env.ADZUNA_APP_ID,
            app_key: process.env.ADZUNA_APP_KEY,
            what: role,
            what_or: (keywords || []).join(' '),
            results_per_page: 20,
            'content-type': 'application/json',
        },
        timeout: 10000,
    });
    return (data?.results || []).map((j) => ({
        extId: String(j.id || ''),
        title: j.title?.replace(/<\/?[^>]+>/g, '') || '',
        company: j.company?.display_name || '',
        location: j.location?.display_name || 'UK',
        salaryMin: j.salary_min || null,
        salaryMax: j.salary_max || null,
        postedAt: j.created ? new Date(j.created) : null,
        source: 'adzuna',
        applyUrl: j.redirect_url || '',
        description: j.description || '',
    }));
}

async function searchJSearch(role, keywords) {
    const { data } = await axios.get('https://jsearch.p.rapidapi.com/search', {
        params: {
            query: `${role} in UK`,
            country: 'gb',
            num_pages: 1,
            date_posted: 'month',
        },
        headers: {
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
        timeout: 10000,
    });
    return (data?.data || []).map((j) => ({
        extId: String(j.job_id || ''),
        title: j.job_title || '',
        company: j.employer_name || '',
        location: [j.job_city, j.job_country].filter(Boolean).join(', ') || 'UK',
        salaryMin: j.job_min_salary || null,
        salaryMax: j.job_max_salary || null,
        postedAt: j.job_posted_at_datetime_utc ? new Date(j.job_posted_at_datetime_utc) : null,
        source: 'jsearch',
        applyUrl: j.job_apply_link || '',
        description: j.job_description || '',
    }));
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

        const tasks = [
            hasAdzuna ? searchAdzuna(role, keywords) : Promise.reject(new Error('no key')),
            hasJSearch ? searchJSearch(role, keywords) : Promise.reject(new Error('no key')),
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
