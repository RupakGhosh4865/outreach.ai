import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chatJson } from './llm.js';

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-GB,en;q=0.9',
};

const textFromHtml = (html) => {
    const $ = cheerio.load(html);
    $('script, style, noscript, svg').remove();
    return $('body').text().replace(/\s+/g, ' ').trim();
};

/** Render a page in headless Chrome — the fallback for sites that block plain HTTP. */
async function fetchViaBrowser(url) {
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
        const page = await browser.newPage();
        await page.setUserAgent(BROWSER_HEADERS['User-Agent']);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const html = await page.content();
        return { text: textFromHtml(html), httpStatus: 200, via: 'browser' };
    } finally {
        await browser.close().catch(() => { /* already gone */ });
    }
}

/**
 * Fetch a job page's text. Tries plain HTTP first, then headless Chrome.
 * Never throws — returns { ok, text, httpStatus, via, error } so ingestion can
 * still record an unreachable job instead of failing the whole request.
 */
export async function fetchJobPage(url) {
    let httpStatus = null;
    let firstError = null;

    try {
        const res = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 12000, validateStatus: () => true });
        httpStatus = res.status;
        if (res.status >= 200 && res.status < 300) {
            const text = textFromHtml(res.data);
            // LinkedIn and friends return a login wall with almost no job text.
            if (text.length > 400) return { ok: true, text, httpStatus, via: 'http' };
            firstError = `Page returned only ${text.length} characters of text (likely a login wall).`;
        } else {
            firstError = `HTTP ${res.status}`;
        }
    } catch (err) {
        firstError = err.message;
    }

    try {
        const viaBrowser = await fetchViaBrowser(url);
        if (viaBrowser.text.length > 200) return { ok: true, ...viaBrowser, httpStatus: httpStatus ?? 200 };
        return { ok: false, text: viaBrowser.text, httpStatus, via: 'browser', error: 'Page had no readable job content.' };
    } catch (err) {
        return { ok: false, text: '', httpStatus, via: 'none', error: `${firstError}; browser fallback: ${err.message}` };
    }
}

/**
 * Turn raw job-page text into a structured, validated job record in one LLM call.
 */
const JOB_SCHEMA = {
    type: 'object',
    properties: {
        jobTitle: { type: 'string' },
        companyName: { type: 'string' },
        location: { type: 'string' },
        jobDescription: {
            type: 'string',
            description: 'Concise summary of the role, responsibilities and requirements. Max 1200 characters.',
        },
        applyMethod: { type: 'string', enum: ['direct', 'external'] },
        isOpen: { type: 'boolean' },
        closingDate: { type: 'string', description: 'YYYY-MM-DD, or an empty string if not stated.' },
        reason: { type: 'string', description: 'One short sentence explaining the isOpen verdict.' },
    },
    required: ['jobTitle', 'companyName', 'location', 'jobDescription', 'applyMethod', 'isOpen', 'closingDate', 'reason'],
    additionalProperties: false,
};

export async function classifyJob({ rawText, url = '' }) {
    const parsed = await chatJson({
        system: 'You read raw scraped text from a job page and extract what is actually there. You never invent details the text does not contain — an empty string is always better than a guess.',
        user: `Source URL: ${url || '(pasted text)'}

Raw page text:
"""
${String(rawText).slice(0, 6000)}
"""

Rules:
- applyMethod is "direct" if the page hosts its own application form; "external" if it links out to another site (LinkedIn, Indeed, an ATS, a company careers page).
- isOpen is false only if the text says the role is closed, filled, expired, or no longer accepting applications, or closingDate has passed. Otherwise true.
- Use empty strings for anything you cannot find.`,
        schema: JOB_SCHEMA,
        schemaName: 'job_posting',
        maxTokens: 1200,
        label: 'classify-job',
    });

    return {
        jobTitle: parsed.jobTitle || '',
        companyName: parsed.companyName || '',
        location: parsed.location || '',
        jobDescription: parsed.jobDescription || '',
        applyMethod: parsed.applyMethod === 'direct' ? 'direct' : 'external',
        isOpen: parsed.isOpen !== false,
        closingDate: parsed.closingDate || '',
        reason: parsed.reason || '',
    };
}

/** Scrape + classify a single job URL. Never throws. */
export async function ingestJobUrl(url) {
    const page = await fetchJobPage(url);

    if (!page.ok || !page.text) {
        return {
            applyUrl: url,
            rawText: page.text || '',
            validation: {
                status: 'unreachable',
                reason: page.error || 'Could not read the page.',
                checkedAt: new Date(),
            },
        };
    }

    try {
        const job = await classifyJob({ rawText: page.text, url });
        return {
            ...job,
            applyUrl: url,
            rawText: page.text,
            validation: {
                status: job.isOpen ? 'open' : 'closed',
                reason: job.reason,
                checkedAt: new Date(),
            },
        };
    } catch (err) {
        console.error('[Scrape] Classification failed:', err.message);
        return {
            applyUrl: url,
            rawText: page.text,
            validation: { status: 'unknown', reason: `Could not classify: ${err.message}`, checkedAt: new Date() },
        };
    }
}

/** Classify job details from text the user pasted or a document they uploaded. */
export async function ingestJobText(rawText, { applyUrl = '' } = {}) {
    try {
        const job = await classifyJob({ rawText, url: applyUrl });
        return {
            ...job,
            applyUrl,
            rawText,
            validation: {
                status: job.isOpen ? 'open' : 'closed',
                reason: job.reason,
                checkedAt: new Date(),
            },
        };
    } catch (err) {
        return {
            applyUrl,
            rawText,
            jobDescription: String(rawText).slice(0, 1200),
            validation: { status: 'unknown', reason: `Could not classify: ${err.message}`, checkedAt: new Date() },
        };
    }
}

/** Extract every http(s) URL from a blob of text (pasted list or uploaded document). */
export function extractUrls(text) {
    return [...new Set(String(text || '').match(/https?:\/\/[^\s<>"')\]]+/g) || [])];
}
