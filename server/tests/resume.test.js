import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { extractPdfText, parseResume, profileSummary } from '../services/resume.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'sample-resume.pdf');

/**
 * Regression guard for the bug that emptied every resume in the system:
 * pdf-parse v2 exports a class, and the old code called the module as a
 * function. The throw was swallowed, so parseResume() silently returned ''
 * and every email and CV was generated with no resume content.
 */
test('extractPdfText returns real text from a PDF', async (t) => {
    if (!fs.existsSync(FIXTURE)) return t.skip('no PDF fixture available');

    const text = await extractPdfText(fs.readFileSync(FIXTURE));
    assert.ok(text.length > 100, `expected substantial text, got ${text.length} chars`);
    assert.ok(/[a-z]/i.test(text), 'expected readable characters');
});

test('parseResume returns non-empty text for a readable PDF', async (t) => {
    if (!fs.existsSync(FIXTURE)) return t.skip('no PDF fixture available');

    const text = await parseResume(FIXTURE);
    assert.notEqual(text, '', 'parseResume silently returning "" is the exact regression to catch');
    assert.ok(text.length <= 4000, 'output is capped for prompt budgeting');
});

test('parseResume returns empty string for an unreadable file rather than throwing', async () => {
    assert.equal(await parseResume('/no/such/file.pdf'), '');
});

test('profileSummary includes only the fields that are set', () => {
    const summary = profileSummary({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        techStack: 'Node, React',
        experienceYears: 3,
        githubUrl: 'https://github.com/ada',
        portfolioUrl: '',
    });
    assert.ok(summary.includes('Name: Ada Lovelace'));
    assert.ok(summary.includes('Tech stack: Node, React'));
    assert.ok(summary.includes('GitHub: https://github.com/ada'));
    assert.ok(!summary.includes('Portfolio'), 'empty fields must not appear');
});

test('profileSummary tolerates a missing profile', () => {
    assert.equal(profileSummary(null), '');
});
