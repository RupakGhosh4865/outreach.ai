import axios from 'axios';
import * as cheerio from 'cheerio';
import { BROWSER_UA, sleep } from './shared.js';

/**
 * LinkedIn public guest jobs endpoint — returns HTML job cards without login.
 * Deliberately low volume (2 pages, 3s apart): heavier use trips LinkedIn's 429/999
 * rate limits. When blocked we return what we have; JSearch still carries
 * LinkedIn postings via Google for Jobs.
 */
export async function searchLinkedIn({ role }) {
    const jobs = [];

    for (const start of [0, 25]) {
        const url = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
        try {
            const { data: html } = await axios.get(url, {
                params: { keywords: role, location: 'United Kingdom', start },
                headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-GB,en;q=0.9' },
                timeout: 12000,
            });

            const $ = cheerio.load(html);
            const cards = $('.base-card, li');
            cards.each((_, el) => {
                const $el = $(el);
                const title = $el.find('.base-search-card__title').text().trim();
                if (!title) return;
                const link = $el.find('a.base-card__full-link').attr('href') || $el.find('a').first().attr('href') || '';
                const dt = $el.find('time').attr('datetime');
                jobs.push({
                    title,
                    company: $el.find('.base-search-card__subtitle').text().trim(),
                    location: $el.find('.job-search-card__location').text().trim() || 'UK',
                    postedAt: dt ? new Date(dt) : null,
                    applyUrl: link.split('?')[0],
                    source: 'linkedin',
                });
            });

            if (cards.length === 0) break; // empty page — stop paging
            await sleep(3000);
        } catch (err) {
            // 429/999 = rate limited. Keep whatever the first page gave us.
            console.warn(`[Radar:linkedin] page start=${start} blocked: ${err.response?.status || err.message}`);
            break;
        }
    }

    return jobs;
}
