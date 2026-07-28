import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'resume.html');
const LAYOUT_TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'resume-layout.html');

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

// ── Layout-preserving rendering ─────────────────────────────────────────────
// Driven by the map derived from the user's own resume PDF, so the output keeps
// their section order, headings, date columns and page count. The generic
// renderer above is the fallback for accounts with no derived template.

/**
 * Strip icon-font artefacts from a contact line.
 *
 * Resumes built in LaTeX draw phone/email/GitHub icons from a symbol font. Those
 * code points extract as private-use or unrelated characters ("I", "§", "ï"),
 * which render as noise once the icon font is gone. Dropping them leaves the
 * readable contact details intact.
 */
function cleanContactLine(text) {
    return String(text || '')
        .replace(/[-�]/g, ' ')          // private-use + replacement char
        .replace(/(^|\s)[|+#§ïïŸ*~^¬](?=\s|$)/g, ' ')     // stray icon stand-ins
        .replace(/(^|\s)I(?=\s*\()/g, ' ')                // "I (+91) ..." — a phone glyph
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s|·•,-]+|[\s|·•,-]+$/g, '')
        .trim();
}

/** Linkify bare URLs and emails in a contact line without trusting its content. */
function linkifyContact(text) {
    return esc(text)
        .replace(/(https?:\/\/[^\s|,]+)/g, '<a href="$1">$1</a>')
        .replace(/([\w.+-]+@[\w-]+\.[\w.]+)/g, '<a href="mailto:$1">$1</a>');
}

// Some CVs nest a second marker inside the bullet text ("• ⋄ Built…"); the list
// already supplies a marker, so a leading one here would double up.
const LEADING_MARKER_RE = /^[•◦‣∙·▪▫⋄◆●○–—*-]\s*/;
const stripMarker = (text) => String(text || '').replace(LEADING_MARKER_RE, '').trim();

/** Turn one layout block into HTML, preserving its kind. */
function renderBlock(block) {
    if (block.type === 'paragraph') {
        return `<p>${esc(block.text)}</p>`;
    }
    if (block.type === 'labeled') {
        return `<div class="labeled">
        <span class="labeled-key">${esc(block.label)}</span>
        <span class="labeled-val">${esc(block.text)}</span>
      </div>`;
    }
    if (block.type === 'bullets') {
        const items = arr(block.items).map(stripMarker).filter(Boolean);
        return items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
    }
    if (block.type === 'entry') {
        const bullets = arr(block.bullets).map(stripMarker).filter(Boolean);
        return `<article class="entry">
        <div class="entry-head">
          <span class="entry-title">${esc(block.left)}</span>
          ${block.right ? `<span class="entry-meta">${esc(block.right)}</span>` : ''}
        </div>
        ${block.sub ? `<div class="entry-sub">${esc(block.sub)}</div>` : ''}
        ${bullets.length ? `<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      </article>`;
    }
    return '';
}

/** Render a layout map to the HTML body of the layout template. */
export function renderLayoutHtml(layout) {
    const header = layout?.header || {};
    const contact = arr(header.contact_lines).concat(arr(header.extra_lines))
        .map(cleanContactLine).filter(Boolean);

    const sections = arr(layout?.sections).map((section) => {
        const blocks = arr(section.blocks).map(renderBlock).join('');
        if (!blocks && !section.heading) return '';
        return `<section>
        ${section.heading ? `<h2>${esc(section.heading)}</h2>` : ''}
        ${blocks}
      </section>`;
    }).join('');

    return `
    <header>
      ${header.name ? `<h1>${esc(header.name)}</h1>` : ''}
      ${header.title ? `<div class="role">${esc(header.title)}</div>` : ''}
      ${contact.length ? `<div class="contact">${contact.map((c) => `<div>${linkifyContact(c)}</div>`).join('')}</div>` : ''}
    </header>
    ${sections}
  `;
}

/**
 * Render a layout map to a PDF, using the type sizes and margins observed in
 * the source resume rather than a house style.
 *
 * @returns {Promise<string>} absolute path to the written PDF
 */
// Serif families seen in LaTeX-built CVs. The rendered document should keep the
// source's character, and a serif CV re-set in Calibri no longer looks like the
// document the candidate approved.
const SERIF_RE = /palladio|palatino|times|georgia|garamond|book|charter|minion|serif|roman|utopia|libertine/i;

/** Rendered page count, used to hold the output to the original's length. */
async function pdfPageCount(filePath) {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: fs.readFileSync(filePath) });
    try {
        const info = await parser.getInfo();
        return info?.total ?? info?.numpages ?? null;
    } catch {
        return null; // don't fail a render just because we couldn't count
    } finally {
        await parser.destroy?.().catch?.(() => { /* already released */ });
    }
}

/**
 * @param {object} layout      the layout map supplying type sizes and margins
 * @param {string} outPath     where to write the PDF
 * @param {object} [opts]
 * @param {string} [opts.bodyHtml] render this instead of the layout's sections
 *                                 (used by the cover letter, which shares the
 *                                 CV's styling but not its structure)
 * @param {boolean} [opts.fitPages] tighten spacing to hit the original page
 *                                  count; off for documents with no target
 */
export async function renderLayoutPdf(layout, outPath, { bodyHtml = null, fitPages = true } = {}) {
    const fonts = layout?.fonts || {};
    const pt = (v, fallback) => `${Number(v) > 0 ? Number(v) : fallback}pt`;
    const family = fonts.body?.family || '';

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    // Margins come from the source document where we measured them, clamped so
    // an odd measurement can't produce an unreadable page. Expressed in mm:
    // Puppeteer's `margin` accepts px/in/cm/mm but not pt.
    const ptToMm = (v) => `${(v * 0.352778).toFixed(2)}mm`;
    const clampMm = (v, lo, hi, fallback) => {
        const n = Number(v);
        return ptToMm(Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : fallback);
    };
    const margin = {
        top: ptToMm(30),
        bottom: ptToMm(26),
        left: clampMm(layout?.margins?.left, 24, 72, 36),
        right: clampMm(layout?.margins?.right, 24, 72, 36),
    };

    const template = fs.readFileSync(LAYOUT_TEMPLATE_PATH, 'utf-8');
    const body = bodyHtml || renderLayoutHtml(layout);

    // PDF points map 1:1 to CSS pt, so the sizes measured off the source PDF
    // carry over directly. They are injected as a stylesheet rather than an
    // inline style attribute — font stacks contain quotes, which would close
    // the attribute and silently drop every variable.
    const buildHtml = (density) => template
        .replace('/*VARS*/', `:root {
            --body-font: ${SERIF_RE.test(family) ? '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif' : '"Calibri", "Carlito", "Helvetica Neue", Arial, sans-serif'};
            --body-size: ${pt(fonts.body?.size, 10)};
            --name-size: ${pt(fonts.name?.size, 18)};
            --heading-size: ${pt(fonts.heading?.size, 12)};
            --header-align: ${layout?.header?.align === 'center' ? 'center' : 'left'};
            --density: ${density};
        }`)
        .replace('<!--RESUME-->', body);

    const target = fitPages ? (Number(layout?.page_count) || null) : null;
    // Tailored text runs a little longer than the original, which can push a
    // one-page CV onto a second page — the most visible way "same layout" fails.
    // Tighten leading and block spacing until it fits, rather than dropping
    // content or shrinking the type the user chose.
    const densities = [1, 0.92, 0.84, 0.76, 0.7];

    const browser = await getBrowser();
    let pages = null;

    for (let i = 0; i < densities.length; i += 1) {
        const page = await browser.newPage();
        try {
            await page.setContent(buildHtml(densities[i]), { waitUntil: 'domcontentloaded' });
            await page.pdf({ path: outPath, format: 'A4', printBackground: true, margin });
        } finally {
            await page.close().catch(() => { /* page already gone */ });
        }

        if (!target || i === densities.length - 1) break;
        pages = await pdfPageCount(outPath);
        if (pages == null || pages <= target) break;
    }

    if (target && pages && pages > target) {
        console.warn(`[Resume] Tailored CV runs to ${pages} page(s) against an original of ${target}.`);
    }

    const { size } = fs.statSync(outPath);
    if (size < 1000) throw new Error(`Rendered PDF looks empty (${size} bytes)`);
    return outPath;
}

/**
 * Render a cover letter to PDF using the CV's own header and type.
 *
 * Built from the same layout map so the letter and the CV read as one set —
 * same name treatment, same contact line, same font — rather than two documents
 * that happen to be attached to the same email.
 */
export async function renderCoverPdf({ layout, text, outPath }) {
    const header = layout?.header || {};
    const contact = arr(header.contact_lines).concat(arr(header.extra_lines))
        .map(cleanContactLine).filter(Boolean);

    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const body = String(text || '').trim();

    // The prompt is told not to sign off, so the signature is added here where
    // the candidate's real name is known.
    const signed = new RegExp(`${esc(header.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').test(body);

    const paragraphs = body.split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

    const inner = `
    <header>
      ${header.name ? `<h1>${esc(header.name)}</h1>` : ''}
      ${contact.length ? `<div class="contact">${contact.map((c) => `<div>${linkifyContact(c)}</div>`).join('')}</div>` : ''}
    </header>
    <div class="letter">
      <p class="letter-date">${esc(date)}</p>
      ${paragraphs}
      ${signed ? '' : `<p class="letter-sign">Yours sincerely,<br>${esc(header.name || '')}</p>`}
    </div>`;

    return renderLayoutPdf(layout, outPath, { bodyHtml: inner, fitPages: false });
}

/**
 * Convert the optimizer's structured JSON resume into a layout map.
 *
 * This is the fallback path, used when no template could be derived from the
 * user's own PDF (a scanned image, or an account that predates derivation).
 * Rather than a second renderer with its own look, it adopts a fixed "studio"
 * preset — serif, centred name, ruled section headings — and goes through
 * `renderLayoutPdf` like everything else. The previous fallback produced a
 * visibly different, much plainer document, which is what users noticed.
 */
export function resumeToLayout(resume) {
    const r = resume || {};
    let n = 0;
    const id = (p) => `${p}${++n}`;

    const section = (heading, blocks) => (blocks.length ? { id: id('s'), heading, blocks } : null);

    const contact = [r.email, r.phone, r.location].filter(Boolean).join('  |  ');
    const links = arr(r.links).filter((l) => l?.url).map((l) => l.label || l.url).join('  |  ');

    const sections = [
        r.summary && section('Summary', [{ type: 'paragraph', id: id('b'), text: r.summary }]),
        section('Skills', arr(r.skills)
            .filter((s) => arr(s.items).length)
            .map((s) => ({ type: 'labeled', id: id('b'), label: `${s.category}:`, text: arr(s.items).join(', ') }))),
        section('Experience', arr(r.experience).map((e) => ({
            type: 'entry',
            id: id('b'),
            left: e.role || '',
            right: [e.start, e.end].filter(Boolean).join(' - '),
            sub: [e.company, e.location].filter(Boolean).join(', '),
            bullets: arr(e.bullets).filter(Boolean),
        }))),
        section('Projects', arr(r.projects).map((p) => ({
            type: 'entry',
            id: id('b'),
            left: p.name || '',
            right: '',
            sub: p.tech || '',
            bullets: arr(p.bullets).filter(Boolean),
        }))),
        section('Education', arr(r.education).map((e) => ({
            type: 'entry',
            id: id('b'),
            left: e.degree || '',
            right: [e.start, e.end].filter(Boolean).join(' - '),
            sub: e.school || '',
            bullets: e.detail ? [e.detail] : [],
        }))),
        section('Certifications', arr(r.certifications).filter(Boolean).length
            ? [{ type: 'bullets', id: id('b'), items: arr(r.certifications).filter(Boolean) }]
            : []),
    ].filter(Boolean);

    return {
        page_size: [595, 842],
        page_count: 0, // unknown — skips the density fitting, which needs a target
        margins: { left: 40, right: 40 },
        fonts: {
            body: { family: 'Palatino', size: 10 },
            name: { size: 19 },
            heading: { size: 11.5 },
        },
        header: {
            name: r.name || '',
            title: r.title || '',
            contact_lines: [contact, links].filter(Boolean),
            extra_lines: [],
            align: 'center',
        },
        sections,
    };
}

/** Plain-text version of a layout map, used to enrich the email prompt. */
export function layoutToText(layout) {
    const lines = [layout?.header?.name, layout?.header?.title];
    for (const section of arr(layout?.sections)) {
        if (section.heading) lines.push(`\n${section.heading}`);
        for (const block of arr(section.blocks)) {
            if (block.type === 'paragraph') lines.push(block.text);
            else if (block.type === 'bullets') lines.push(...arr(block.items));
            else if (block.type === 'entry') {
                lines.push([block.left, block.right].filter(Boolean).join(' '));
                if (block.sub) lines.push(block.sub);
                lines.push(...arr(block.bullets));
            }
        }
    }
    return lines.filter(Boolean).join('\n').slice(0, 4000);
}

let browserPromise = null;

/** One shared headless browser for the process; relaunched if it dies. */
export async function getBrowser() {
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
