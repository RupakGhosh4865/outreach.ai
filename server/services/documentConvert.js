import fs from 'fs';
import path from 'path';
import { getBrowser } from './pdfRenderer.js';

const WORD_EXTENSIONS = new Set(['.doc', '.docx']);

/** True when an uploaded file is a Word document rather than a PDF. */
export function isWordFile(filename) {
    return WORD_EXTENSIONS.has(path.extname(filename || '').toLowerCase());
}

// Word's own styling doesn't survive the HTML round-trip, so we supply a plain
// document sheet. This only affects files the user uploaded as .doc/.docx —
// PDFs are stored untouched.
const WRAPPER_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Calibri, Carlito, "Helvetica Neue", Arial, sans-serif;
         font-size: 11pt; line-height: 1.4; color: #111; }
  h1 { font-size: 17pt; margin: 0 0 6pt; }
  h2 { font-size: 13pt; margin: 14pt 0 4pt; }
  h3 { font-size: 11.5pt; margin: 10pt 0 3pt; }
  p  { margin: 0 0 6pt; }
  ul, ol { margin: 0 0 6pt; padding-left: 18pt; }
  li { margin: 0 0 3pt; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: 4pt; vertical-align: top; }
  img { max-width: 100%; }
`;

/**
 * Convert an uploaded .doc/.docx into a PDF sitting next to it.
 *
 * Everything downstream of the profile upload — resume text extraction, the
 * optimizer's PyMuPDF parser, template derivation, email attachments — reads
 * PDFs only. Converting once here keeps that single-format assumption true
 * instead of teaching every consumer about Word.
 *
 * @returns {Promise<string>} absolute path to the written PDF
 * @throws if the document cannot be read or produces no content
 */
export async function convertToPdf(srcPath) {
    const { default: mammoth } = await import('mammoth');

    const { value: bodyHtml } = await mammoth.convertToHtml({ path: srcPath });
    if (!bodyHtml?.trim()) {
        throw new Error('The Word document appears to be empty or unreadable.');
    }

    const html = `<!doctype html><html><head><meta charset="utf-8">
      <style>${WRAPPER_CSS}</style></head><body>${bodyHtml}</body></html>`;

    const outPath = `${srcPath.replace(/\.docx?$/i, '')}.pdf`;
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        await page.pdf({ path: outPath, format: 'A4', printBackground: true });
    } finally {
        await page.close().catch(() => { /* page already gone */ });
    }

    const { size } = fs.statSync(outPath);
    if (size < 1000) throw new Error(`Converted PDF looks empty (${size} bytes)`);
    return outPath;
}

/**
 * Normalise an uploaded resume to a PDF on disk.
 *
 * PDFs pass straight through. Word files are converted and the original is
 * removed, so only one file per slot is ever retained.
 *
 * @returns {Promise<{path: string, converted: boolean}>}
 */
export async function ensurePdf(file) {
    if (!isWordFile(file.originalname)) return { path: file.path, converted: false };

    const pdfPath = await convertToPdf(file.path);
    try { fs.unlinkSync(file.path); }
    catch (err) {
        if (err.code !== 'ENOENT') console.warn('[documentConvert] Could not remove source:', err.message);
    }
    return { path: pdfPath, converted: true };
}
