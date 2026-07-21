import 'dotenv/config';

export const BROWSER_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Normalised job shape every connector returns. */
export function normalizeJob(job) {
    return {
        title: (job.title || '').trim(),
        company: (job.company || '').trim(),
        location: (job.location || 'UK').trim(),
        description: job.description || '',
        applyUrl: job.applyUrl || '',
        salaryMin: job.salaryMin || null,
        salaryMax: job.salaryMax || null,
        postedAt: job.postedAt || null,
        closingDate: job.closingDate || null,
        source: job.source,
        sourceDetail: job.sourceDetail || '',
        visaSponsor: Boolean(job.visaSponsor),
    };
}

/**
 * Run a connector with a hard timeout. Connectors must fail soft: any error or
 * timeout yields [] so one blocked site never sinks the whole scan.
 */
export async function safeSearch(name, fn, timeoutMs = 45000) {
    try {
        const result = await Promise.race([
            fn(),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${timeoutMs / 1000}s`)), timeoutMs).unref?.() ?? undefined),
        ]);
        const jobs = (result || []).filter((j) => j.title && (j.applyUrl || j.company)).map(normalizeJob);
        console.log(`[Radar:${name}] found ${jobs.length} job(s)`);
        return { ok: true, jobs };
    } catch (err) {
        console.warn(`[Radar:${name}] failed: ${err.message}`);
        return { ok: false, jobs: [], error: err.message };
    }
}

// Shared headless browser for scraping connectors (separate from the PDF one so a
// crashed scrape page never disturbs CV rendering).
let browserPromise = null;

export async function getScrapeBrowser() {
    if (!browserPromise) {
        browserPromise = (async () => {
            const { default: puppeteer } = await import('puppeteer');
            const browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
            });
            browser.on('disconnected', () => { browserPromise = null; });
            return browser;
        })().catch((err) => { browserPromise = null; throw err; });
    }
    return browserPromise;
}

/** Fetch a page's HTML via the shared browser. Throws on nav failure. */
export async function browserHtml(url, { waitMs = 2500, timeout = 25000 } = {}) {
    const browser = await getScrapeBrowser();
    const page = await browser.newPage();
    try {
        await page.setUserAgent(BROWSER_UA);
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
        await sleep(waitMs); // let client-side lists hydrate
        return await page.content();
    } finally {
        await page.close().catch(() => { /* already gone */ });
    }
}

/** True when a page is an anti-bot interstitial rather than real content. */
export function looksBlocked(html) {
    return /cf-challenge|cloudflare|are you a human|unusual traffic|captcha|verify you are|access denied|just a moment/i.test(
        String(html).slice(0, 6000)
    );
}
