import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'resume.html');

const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const arr = (v) => (Array.isArray(v) ? v : []);

/** Turn the optimizer's JSON resume into the HTML body that fills the template. */
export function renderResumeHtml(resume) {
    const r = resume || {};
    const links = arr(r.links).filter((l) => l?.url);

    // Plain ASCII separators — the PDF font stack drops fancier dashes/bullets.
    const dateRange = (start, end) => [start, end].filter(Boolean).join(' - ');

    const section = (title, inner) => (inner ? `<section><h2>${esc(title)}</h2>${inner}</section>` : '');

    const skills = arr(r.skills).filter((s) => arr(s.items).length);
    const skillsHtml = skills.length
        ? `<ul class="skills">${skills.map((s) => `<li><span class="cat">${esc(s.category)}:</span> ${esc(arr(s.items).join(', '))}</li>`).join('')}</ul>`
        : '';

    const entry = (heading, subheading, meta, bullets) => `
      <article class="entry">
        <div class="entry-head">
          <span class="entry-title">${esc(heading)}</span>
          ${meta ? `<span class="entry-meta">${esc(meta)}</span>` : ''}
        </div>
        ${subheading ? `<div class="entry-sub">${esc(subheading)}</div>` : ''}
        ${arr(bullets).length ? `<ul>${arr(bullets).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      </article>`;

    const experienceHtml = arr(r.experience)
        .map((e) => entry(e.role, [e.company, e.location].filter(Boolean).join(', '), dateRange(e.start, e.end), e.bullets))
        .join('');

    const projectsHtml = arr(r.projects)
        .map((p) => entry(p.name, p.tech, '', p.bullets))
        .join('');

    const educationHtml = arr(r.education)
        .map((e) => entry(e.degree, e.school, dateRange(e.start, e.end), e.detail ? [e.detail] : []))
        .join('');

    const certs = arr(r.certifications).filter(Boolean);
    const certsHtml = certs.length ? `<ul>${certs.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '';

    const contactBits = [r.email, r.phone, r.location].filter(Boolean).map((c) => `<span>${esc(c)}</span>`);
    const linkBits = links.map((l) => `<span><a href="${esc(l.url)}">${esc(l.label || l.url)}</a></span>`);

    // Separator is drawn in CSS rather than as a literal glyph — the PDF font
    // stack doesn't reliably carry a bullet character.
    return `
    <header>
      <h1>${esc(r.name || 'Candidate')}</h1>
      ${r.title ? `<div class="role">${esc(r.title)}</div>` : ''}
      <div class="contact">${[...contactBits, ...linkBits].join('')}</div>
    </header>
    ${r.summary ? `<section><h2>Summary</h2><p>${esc(r.summary)}</p></section>` : ''}
    ${section('Skills', skillsHtml)}
    ${section('Experience', experienceHtml)}
    ${section('Projects', projectsHtml)}
    ${section('Education', educationHtml)}
    ${section('Certifications', certsHtml)}
  `;
}

let browserPromise = null;

/** One shared headless browser for the process; relaunched if it dies. */
async function getBrowser() {
    if (!browserPromise) {
        browserPromise = (async () => {
            const { default: puppeteer } = await import('puppeteer');
            const browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            });
            browser.on('disconnected', () => { browserPromise = null; });
            return browser;
        })().catch((err) => {
            browserPromise = null;
            throw err;
        });
    }
    return browserPromise;
}

/**
 * Render a structured JSON resume to a PDF on disk.
 * @returns {Promise<string>} absolute path to the written PDF
 */
export async function renderResumePdf(resume, outPath) {
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
    const html = template.replace('<!--RESUME-->', renderResumeHtml(resume));

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        await page.pdf({
            path: outPath,
            format: 'A4',
            printBackground: true,
            margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' },
        });
    } finally {
        await page.close().catch(() => { /* page already gone */ });
    }

    const { size } = fs.statSync(outPath);
    if (size < 1000) throw new Error(`Rendered PDF looks empty (${size} bytes)`);
    return outPath;
}

/** Plain-text version of the resume, used to enrich the email prompt. */
export function resumeToText(resume) {
    const r = resume || {};
    const lines = [r.name, r.title, r.summary];
    for (const s of arr(r.skills)) lines.push(`${s.category}: ${arr(s.items).join(', ')}`);
    for (const e of arr(r.experience)) {
        lines.push(`${e.role} — ${e.company} (${[e.start, e.end].filter(Boolean).join(' - ')})`);
        lines.push(...arr(e.bullets));
    }
    for (const p of arr(r.projects)) {
        lines.push(`${p.name} — ${p.tech || ''}`);
        lines.push(...arr(p.bullets));
    }
    for (const e of arr(r.education)) lines.push(`${e.degree} — ${e.school}`);
    return lines.filter(Boolean).join('\n').slice(0, 4000);
}

export async function closeBrowser() {
    if (!browserPromise) return;
    try {
        const browser = await browserPromise;
        await browser.close();
    } catch { /* already closed */ }
    browserPromise = null;
}
