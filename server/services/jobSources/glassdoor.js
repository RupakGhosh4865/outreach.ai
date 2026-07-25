import * as cheerio from 'cheerio';
import { browserHtml, looksBlocked } from './shared.js';

/**
 * Glassdoor UK — best-effort headless scrape. Prefers the JSON-LD ItemList the
 * search page embeds; falls back to DOM cards. Cloudflare-guarded, so expect
 * intermittent failures (JSearch backfills Glassdoor postings).
 */
export async function searchGlassdoor({ role }) {
    const slug = role.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const url = `https://www.glassdoor.co.uk/Job/uk-${slug}-jobs-SRCH_IL.0,2_IN2_KO3,${3 + slug.length}.htm`;
    const html = await browserHtml(url, { waitMs: 3500 });
    if (looksBlocked(html)) throw new Error('blocked by anti-bot challenge');

    const $ = cheerio.load(html);
    const jobs = [];

    // 1. JSON-LD (most reliable when present)
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).contents().text());
            const items = data?.itemListElement || (data?.['@type'] === 'JobPosting' ? [{ item: data }] : []);
            for (const entry of items) {
                const j = entry.item || entry;
                if (j?.['@type'] !== 'JobPosting' || !j.title) continue;
                jobs.push({
                    title: j.title,
                    company: j.hiringOrganization?.name || '',
                    location: j.jobLocation?.address?.addressLocality || 'UK',
                    description: (j.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1500),
                    postedAt: j.datePosted ? new Date(j.datePosted) : null,
                    applyUrl: j.url || entry.url || '',
                    source: 'glassdoor',
                });
            }
        } catch { /* malformed LD block — ignore */ }
    });

    // 2. DOM fallback
    if (!jobs.length) {
        $('li[data-test="jobListing"], [data-test="job-card-wrapper"]').each((_, el) => {
            const $el = $(el);
            const title = $el.find('[data-test="job-title"], a[id^="job-title"]').first().text().trim();
            if (!title) return;
            const href = $el.find('a').first().attr('href') || '';
            jobs.push({
                title,
                company: $el.find('[data-test="employer-name"], .EmployerProfile_compactEmployerName__9MGcV').first().text().trim(),
                location: $el.find('[data-test="emp-location"]').first().text().trim() || 'UK',
                applyUrl: href ? new URL(href, 'https://www.glassdoor.co.uk').href : '',
                source: 'glassdoor',
            });
        });
    }

    return jobs;
}
