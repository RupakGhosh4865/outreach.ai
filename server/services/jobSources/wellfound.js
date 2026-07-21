import * as cheerio from 'cheerio';
import { browserHtml, looksBlocked } from './shared.js';

/**
 * Wellfound (AngelList Talent) — startup jobs. Reads the Apollo state embedded in
 * the Next.js payload; DOM fallback when the payload shape shifts.
 */
export async function searchWellfound({ role }) {
    const slug = role.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const url = `https://wellfound.com/role/l/${slug}/united-kingdom`;
    const html = await browserHtml(url, { waitMs: 3500 });
    if (looksBlocked(html)) throw new Error('blocked by anti-bot challenge');

    const $ = cheerio.load(html);
    const jobs = [];

    // 1. __NEXT_DATA__ Apollo cache
    const nextData = $('#__NEXT_DATA__').contents().text();
    if (nextData) {
        try {
            const data = JSON.parse(nextData);
            const apollo = data?.props?.pageProps?.apolloState?.data || {};
            const companies = {};
            for (const [key, val] of Object.entries(apollo)) {
                if (key.startsWith('StartupResult') && val?.name) companies[key] = val.name;
            }
            for (const [key, val] of Object.entries(apollo)) {
                if (!key.startsWith('JobListingSearchResult') || !val?.title) continue;
                jobs.push({
                    title: val.title,
                    company: companies[val.startup?.__ref] || '',
                    location: (val.locationNames || []).join(', ') || 'UK / Remote',
                    salaryMin: val.compensation ? null : null,
                    description: (val.description || '').slice(0, 1500),
                    postedAt: val.liveStartAt ? new Date(val.liveStartAt * 1000) : null,
                    applyUrl: val.slug ? `https://wellfound.com/jobs/${val.id}-${val.slug}` : '',
                    source: 'wellfound',
                });
            }
        } catch { /* payload shape changed — fall through to DOM */ }
    }

    // 2. DOM fallback
    if (!jobs.length) {
        $('a[href^="/jobs/"]').each((_, el) => {
            const $el = $(el);
            const title = $el.text().trim();
            if (!title || title.length > 90) return;
            jobs.push({
                title,
                company: $el.closest('[data-test="StartupResult"]').find('h2').first().text().trim(),
                location: 'UK / Remote',
                applyUrl: new URL($el.attr('href'), 'https://wellfound.com').href,
                source: 'wellfound',
            });
        });
    }

    return jobs;
}
