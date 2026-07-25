import * as cheerio from 'cheerio';
import { browserHtml, looksBlocked } from './shared.js';

/**
 * Google Jobs panel — secondary source (JSearch serves the same data via a
 * licensed API). Consent walls and layout churn make this the flakiest
 * connector; it fails soft.
 */
export async function searchGoogleJobs({ role }) {
    const url = `https://www.google.com/search?q=${encodeURIComponent(`${role} jobs UK`)}&ibp=htl;jobs&hl=en&gl=uk`;
    const html = await browserHtml(url, { waitMs: 3500 });
    if (looksBlocked(html) || /consent\.google/i.test(html)) throw new Error('blocked by consent/anti-bot wall');

    const $ = cheerio.load(html);
    const jobs = [];

    // Jobs panel list items (selectors churn frequently — best effort)
    $('li a[href], div[jscontroller] div[role="listitem"]').each((_, el) => {
        const $el = $(el);
        const text = $el.text();
        const title = $el.find('div[role="heading"], h3').first().text().trim();
        if (!title || title.length > 100) return;
        // company · location usually follows the heading
        const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
        const idx = lines.indexOf(title);
        jobs.push({
            title,
            company: lines[idx + 1] || '',
            location: lines[idx + 2] || 'UK',
            applyUrl: '', // Google panel links are ephemeral; JSearch supplies apply links
            source: 'google',
        });
    });

    // Dedupe by title|company
    const seen = new Set();
    return jobs.filter((j) => {
        const key = `${j.title}|${j.company}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
