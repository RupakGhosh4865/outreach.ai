import * as cheerio from 'cheerio';
import { browserHtml, looksBlocked } from './shared.js';

/**
 * Indeed UK — best-effort headless scrape of one results page. Indeed sits behind
 * Cloudflare, so this frequently gets an interstitial; we detect it and bail
 * (JSearch backfills Indeed postings via Google for Jobs).
 */
export async function searchIndeed({ role }) {
    const url = `https://uk.indeed.com/jobs?q=${encodeURIComponent(role)}&l=United+Kingdom`;
    const html = await browserHtml(url, { waitMs: 3500 });
    if (looksBlocked(html)) throw new Error('blocked by anti-bot challenge');

    const $ = cheerio.load(html);
    const jobs = [];
    $('.job_seen_beacon, [data-testid="slider_item"]').each((_, el) => {
        const $el = $(el);
        const title = $el.find('h2.jobTitle span, [data-testid="jobTitle"]').first().text().trim()
            || $el.find('h2').first().text().trim();
        if (!title) return;
        const href = $el.find('h2 a, a[data-jk]').first().attr('href') || '';
        jobs.push({
            title,
            company: $el.find('[data-testid="company-name"], .companyName').first().text().trim(),
            location: $el.find('[data-testid="text-location"], .companyLocation').first().text().trim() || 'UK',
            description: $el.find('.job-snippet, [data-testid="jobsnippet_footer"]').text().trim(),
            applyUrl: href ? new URL(href, 'https://uk.indeed.com').href : '',
            source: 'indeed',
        });
    });

    if (!jobs.length && /indeed/i.test(html) === false) throw new Error('page did not render job results');
    return jobs;
}
