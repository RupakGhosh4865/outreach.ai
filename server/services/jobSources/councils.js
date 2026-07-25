import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';

import { UK_COUNCILS } from '../../data/ukCouncils.js';
import JobSearchCache from '../../models/JobSearchCache.js';
import { CACHE_TTL_SECONDS } from '../../models/JobSearchCache.js';
import { fetchJobPage } from '../scrape.js';
import { chatJson } from '../llm.js';
import { BROWSER_UA, getScrapeBrowser, sleep } from './shared.js';

// Must not exceed the collection's TTL index, or the "cached" branch below can
// never be reached — Mongo would have deleted the document first.
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;
const CAREERS_HREF = /job|career|vacanc|work[-\s]?for[-\s]?us|recruit/i;

/**
 * Score how likely a link points at the council's OWN vacancy list rather than
 * residents' jobs advice ("Jobs, skills and training") or news.
 */
function scoreCareersCandidate(href, text) {
    let score = 0;
    const t = text.toLowerCase();
    const h = href.toLowerCase();
    try {
        const host = new URL(href).hostname;
        if (/^(jobs|careers|recruitment|vacancies)\./.test(host)) score += 6; // dedicated ATS subdomain
    } catch { return -1; }
    if (/work(ing)?[\s-]?(for|with)[\s-]?us|jobs? with the council|council jobs|current vacanc|our vacanc/.test(t)) score += 5;
    if (/vacanc/.test(h) || /vacanc/.test(t)) score += 3;
    if (/jobs?[/.-]|careers?/.test(h)) score += 1;
    if (/training|skills|apprentice|volunteer|jobshop|advice|support/.test(h + ' ' + t)) score -= 4; // residents' services
    return score;
}

/** Find a council's own careers/vacancies page from its homepage links. */
async function findCareersUrl(website) {
    try {
        const { data: html } = await axios.get(website, {
            headers: { 'User-Agent': BROWSER_UA },
            timeout: 10000,
            maxRedirects: 5,
        });
        const $ = cheerio.load(html);
        let best = null;
        let bestScore = 0;
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().trim();
            if (!CAREERS_HREF.test(href) && !CAREERS_HREF.test(text)) return;
            let abs;
            try { abs = new URL(href, website).href; } catch { return; }
            const score = scoreCareersCandidate(abs, text);
            if (score > bestScore) { best = abs; bestScore = score; }
        });
        if (best) return best;
    } catch { /* homepage unreachable — try common paths below */ }

    for (const path of ['jobs', 'careers', 'jobs-and-careers']) {
        try {
            const url = new URL(path, website).href;
            const res = await axios.head(url, { headers: { 'User-Agent': BROWSER_UA }, timeout: 6000, maxRedirects: 5 });
            if (res.status < 400) return url;
        } catch { /* next path */ }
    }
    return null;
}

/**
 * Careers landing pages often just link to the vacancy search. Find the most
 * listing-like link on the page so we can follow one hop before parsing.
 */
function findVacancyListLink(html, baseUrl) {
    const $ = cheerio.load(html);
    let best = null;
    let bestScore = 0;
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim().toLowerCase();
        let abs;
        try { abs = new URL(href, baseUrl).href; } catch { return; }
        if (abs === baseUrl) return;
        let score = 0;
        if (/search.*(job|vacanc|opportunit)|view.*(job|vacanc|opportunit)|current vacanc|(job|vacanc).*search|browse.*(job|vacanc)|all (vacanc|opportunit|job)|latest vacanc|apply for.*job/.test(text)) score += 5;
        if (/vacanc|joblist|job-list|search|webrecruitment|recruit/i.test(href)) score += 2;
        try {
            const host = new URL(abs).hostname;
            if (/^(jobs|careers|recruitment|vacancies|hub)\./.test(host)) score += 2;
            // Common council ATS platforms — a link out to one is almost always the vacancy list
            if (/webitrent|jobsgopublic|talentlink|engageats|tribepad|oleeo|jobtrain|networxrecruitment|wmjobs|eastleighjobs|myjobscotland/i.test(host)) score += 5;
        } catch { /* ignore */ }
        if (score > bestScore) { best = abs; bestScore = score; }
    });
    return bestScore >= 5 ? best : null;
}

/**
 * Council ATS portals (webitrent, TalentLink, …) often show only a search form
 * until "Find jobs" is clicked. Load the page in the browser and, if it looks
 * like a bare form, click the search/submit control and wait for results.
 */
async function fetchWithSearchClick(url) {
    const browser = await getScrapeBrowser();
    const page = await browser.newPage();
    try {
        await page.setUserAgent(BROWSER_UA);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(2500);

        let text = await page.evaluate(() => document.body?.innerText || '');
        const looksLikeBareForm = text.length < 4000 && /search|find jobs|criteria/i.test(text);

        if (looksLikeBareForm) {
            const clicked = await page.evaluate(() => {
                const controls = [...document.querySelectorAll('button, input[type="submit"], a')];
                const target = controls.find((el) =>
                    /find jobs|search jobs|^search$|view (all )?(jobs|vacanc|opportunit)|show (jobs|vacanc)/i
                        .test((el.innerText || el.value || '').trim())
                );
                if (target) { target.click(); return true; }
                const form = document.querySelector('form');
                if (form) { form.submit(); return true; }
                return false;
            });
            if (clicked) {
                await sleep(5000); // results load (often same-page AJAX or a nav)
                text = await page.evaluate(() => document.body?.innerText || '');
            }
        }
        return { ok: text.length > 200, text: text.replace(/\s+/g, ' ').trim(), finalUrl: page.url() };
    } catch (err) {
        return { ok: false, text: '', error: err.message };
    } finally {
        await page.close().catch(() => { /* gone */ });
    }
}

/** LLM-parse a careers page's text into job listings. */
async function extractListings(pageText, councilName, careersUrl) {
    const parsed = await chatJson({
        system: 'You extract job vacancy listings from raw scraped council careers-page text. Never invent listings — if the page shows no concrete vacancies, return an empty array.',
        user: `Council: ${councilName}
Careers page URL: ${careersUrl}

Raw page text:
"""
${String(pageText).slice(0, 7000)}
"""

Max 15 listings. Only include actual job vacancies — not category pages, news items, "sign up for alerts", or generic "work for us" blurbs.
Use an empty string for any field the page does not state.`,
        schema: {
            type: 'object',
            properties: {
                listings: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string' },
                            location: { type: 'string' },
                            salary: { type: 'string' },
                            closingDate: { type: 'string', description: 'YYYY-MM-DD or empty string' },
                            url: { type: 'string', description: 'Absolute or relative link if visible, else empty string' },
                        },
                        required: ['title', 'location', 'salary', 'closingDate', 'url'],
                        additionalProperties: false,
                    },
                },
            },
            required: ['listings'],
            additionalProperties: false,
        },
        schemaName: 'council_listings',
        maxTokens: 2000,
        label: 'council-listings',
    });

    return Array.isArray(parsed.listings) ? parsed.listings : [];
}

const parseSalary = (s) => {
    const nums = String(s || '').match(/[\d,]{4,}/g)?.map((n) => parseInt(n.replace(/,/g, ''), 10)) || [];
    return { salaryMin: nums[0] || null, salaryMax: nums[1] || nums[0] || null };
};

/** Scrape one council. Returns { jobs, error }. Cached for 12h per (council, roles). */
async function scrapeCouncil(council, roleHash) {
    const domain = new URL(council.website).hostname;
    const cacheKey = `council:${domain}:${roleHash}`;
    const queryHash = crypto.createHash('sha256').update(cacheKey).digest('hex');

    const cached = await JobSearchCache.findOne({ queryHash }).lean();
    if (cached && Date.now() - new Date(cached.createdAt).getTime() < CACHE_TTL_MS) {
        return { jobs: cached.results || [], cached: true };
    }

    let careersUrl = await findCareersUrl(council.website);
    if (!careersUrl) return { jobs: [], error: 'careers page not found' };

    // Careers landing pages usually link to the actual vacancy search — follow one hop.
    try {
        const { data: careersHtml } = await axios.get(careersUrl, {
            headers: { 'User-Agent': BROWSER_UA }, timeout: 10000, maxRedirects: 5,
        });
        const listUrl = findVacancyListLink(careersHtml, careersUrl);
        if (listUrl) careersUrl = listUrl;
    } catch { /* keep the landing page; fetchJobPage below has a browser fallback */ }

    // Browser fetch that can click "Find jobs" on ATS search forms; fall back to
    // the plain scraper if the browser path fails.
    let page = await fetchWithSearchClick(careersUrl);
    if (!page.ok) page = await fetchJobPage(careersUrl);
    if (!page.ok || page.text.length < 200) {
        return { jobs: [], error: page.error || 'careers page unreadable' };
    }

    let listings = [];
    try {
        listings = await extractListings(page.text, council.name, careersUrl);
    } catch (err) {
        return { jobs: [], error: `parse failed: ${err.message}` };
    }

    const jobs = listings.map((l) => ({
        title: l.title,
        company: council.name,
        location: l.location || council.name.replace(/ (Borough |City |County |District )?Council.*/i, ''),
        ...parseSalary(l.salary),
        closingDate: l.closingDate ? new Date(l.closingDate) : null,
        applyUrl: l.url ? (() => { try { return new URL(l.url, careersUrl).href; } catch { return careersUrl; } })() : careersUrl,
        source: 'council',
        sourceDetail: council.name,
        visaSponsor: true, // list is councils holding a sponsorship licence
    }));

    await JobSearchCache.findOneAndUpdate(
        { queryHash },
        { queryHash, role: cacheKey, keywords: [], results: jobs, createdAt: new Date() },
        { upsert: true }
    ).catch((e) => console.warn('[Radar:councils] cache save failed:', e.message));

    return { jobs };
}

/** Quick local relevance check so we don't keep every council's unrelated vacancies. */
function titleMatchesRoles(title, roleWords) {
    const t = String(title).toLowerCase();
    return roleWords.some((words) => words.filter((w) => t.includes(w)).length >= Math.min(1, words.length));
}

/**
 * Scrape all councils in small batches. `onProgress({done,total,unreachable})` keeps
 * the ScanRun updated so the UI can show "Councils 43/118".
 */
export async function searchCouncils({ roles, onProgress, councils = UK_COUNCILS, batchSize = 5 }) {
    const roleWords = roles.map((r) => r.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    const roleHash = crypto.createHash('sha256').update(roles.join('|').toLowerCase()).digest('hex').slice(0, 10);

    const all = [];
    const unreachable = [];
    let done = 0;

    for (let i = 0; i < councils.length; i += batchSize) {
        const batch = councils.slice(i, i + batchSize);
        const results = await Promise.allSettled(batch.map((c) => scrapeCouncil(c, roleHash)));

        results.forEach((r, idx) => {
            const council = batch[idx];
            if (r.status === 'fulfilled') {
                if (r.value.error) unreachable.push(`${council.name}: ${r.value.error}`);
                const relevant = (r.value.jobs || []).filter((j) => titleMatchesRoles(j.title, roleWords));
                all.push(...relevant);
            } else {
                unreachable.push(`${council.name}: ${r.reason?.message || 'failed'}`);
            }
        });

        done = Math.min(i + batchSize, councils.length);
        await onProgress?.({ done, total: councils.length, unreachable });
    }

    return all;
}
