import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { attachResume, escapeHtml, bodyToHtml, senderIdentity, hasUserMailbox } from '../services/mailer.js';

const tmpFile = (name) => {
    const p = path.join(os.tmpdir(), `outreach-test-${Date.now()}-${name}`);
    fs.writeFileSync(p, 'pdf bytes');
    return p;
};

test('escapeHtml neutralises markup', () => {
    assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('bodyToHtml escapes the body it embeds', () => {
    // The body comes from an LLM and from user edits; it used to be interpolated raw.
    const html = bodyToHtml('5 < 10 & "quoted"');
    assert.ok(html.includes('5 &lt; 10 &amp; &quot;quoted&quot;'));
    assert.ok(!html.includes('5 < 10'));
});

test('attachResume prefers the freshly optimized PDF', () => {
    const optimized = tmpFile('opt.pdf');
    const profileResume = tmpFile('profile.pdf');
    try {
        const result = attachResume({
            optimizedPdfPath: optimized,
            profile: { name: 'Nikita Sah', resumePath: profileResume, resumeOriginalName: 'Mine.pdf' },
            body: 'My resume is attached.',
            jobTitle: 'Backend Engineer',
            companyName: 'Barclays PLC',
        });
        assert.equal(result.attachmentStatus, 'optimized');
        assert.equal(result.attachments[0].path, optimized);
        // Recruiters see the filename before they open anything, so it names
        // the candidate and the application rather than "Resume_...".
        assert.equal(result.attachments[0].filename, 'Nikita_Sah_Barclays_PLC_Backend_Engineer.pdf');
        assert.equal(result.body, 'My resume is attached.', 'body is untouched when an attachment exists');
    } finally {
        fs.unlinkSync(optimized); fs.unlinkSync(profileResume);
    }
});

test('attachResume names the cover letter to match the CV', () => {
    const optimized = tmpFile('opt.pdf');
    const cover = tmpFile('cover.pdf');
    try {
        const { attachments } = attachResume({
            optimizedPdfPath: optimized,
            coverPdfPath: cover,
            profile: { name: 'Nikita Sah' },
            body: 'Attached.',
            jobTitle: 'Business Analyst',
            companyName: 'Mears',
        });
        assert.equal(attachments.length, 2);
        assert.equal(attachments[0].filename, 'Nikita_Sah_Mears_Business_Analyst.pdf');
        assert.equal(attachments[1].filename, 'Nikita_Sah_Mears_Business_Analyst_Cover_Letter.pdf');
    } finally {
        fs.unlinkSync(optimized); fs.unlinkSync(cover);
    }
});

test('attachResume drops missing name parts instead of leaving separators', () => {
    const optimized = tmpFile('opt.pdf');
    try {
        const { attachments } = attachResume({
            optimizedPdfPath: optimized,
            profile: {},
            body: 'Attached.',
            jobTitle: 'Backend Engineer',
        });
        assert.equal(attachments[0].filename, 'Backend_Engineer.pdf');
    } finally {
        fs.unlinkSync(optimized);
    }
});

test('attachResume falls back to the profile resume', () => {
    const profileResume = tmpFile('profile.pdf');
    try {
        const result = attachResume({
            optimizedPdfPath: '/does/not/exist.pdf',
            profile: { resumePath: profileResume, resumeOriginalName: 'Mine.pdf' },
            body: 'Resume attached.',
        });
        assert.equal(result.attachmentStatus, 'profile');
        assert.equal(result.attachments[0].filename, 'Mine.pdf');
    } finally {
        fs.unlinkSync(profileResume);
    }
});

test('attachResume never promises a file it does not have', () => {
    const result = attachResume({
        optimizedPdfPath: null,
        profile: {},
        body: 'I am keen on the role.\nMy resume is attached for your review.\nThanks',
    });
    assert.equal(result.attachmentStatus, 'missing');
    assert.deepEqual(result.attachments, []);
    assert.ok(!/attach/i.test(result.body), `still claims an attachment: ${result.body}`);
    assert.ok(result.body.includes('I am keen on the role.'));
});

test('senderIdentity uses the shared mailbox when the user has not connected one', () => {
    process.env.GMAIL_USER = 'app@example.com';
    const from = senderIdentity({ name: 'Ada Lovelace', email: 'ada@personal.com' }, 'ada@personal.com');
    assert.equal(from, '"Ada Lovelace" <app@example.com>');
});

test('senderIdentity sends from the user mailbox once connected', () => {
    process.env.GMAIL_USER = 'app@example.com';
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    const profile = {
        name: 'Ada Lovelace',
        email: 'ada@personal.com',
        gmail: { address: 'ada@personal.com', refreshToken: 'token' },
    };
    assert.ok(hasUserMailbox(profile));
    assert.equal(senderIdentity(profile, 'ada@personal.com'), '"Ada Lovelace" <ada@personal.com>');
});

test('senderIdentity strips quotes that would break the header', () => {
    process.env.GMAIL_USER = 'app@example.com';
    const from = senderIdentity({ name: 'Ada "Hacker" Lovelace' }, 'ada@personal.com');
    assert.equal(from, '"Ada Hacker Lovelace" <app@example.com>');
});

test('documentFileName is built from the CV, not the account', async () => {
    const { documentFileName } = await import('../services/resume.js');

    // The account holder may be applying on someone else's behalf, so the name
    // comes off the CV. All-caps headers are softened, but acronyms survive.
    assert.equal(
        documentFileName({ candidateName: 'NIKITA SAH', companyName: 'Amaris Consulting', jobTitle: 'Business Analyst' }),
        'Nikita_Sah_Amaris_Consulting_Business_Analyst.pdf',
    );
    assert.equal(
        documentFileName({ candidateName: 'Nikita Sah', companyName: 'KPMG', jobTitle: 'BA' }),
        'Nikita_Sah_KPMG_BA.pdf',
    );
    assert.equal(
        documentFileName({ candidateName: 'Nikita Sah', companyName: 'Amaris', jobTitle: 'BA', suffix: 'Cover Letter' }),
        'Nikita_Sah_Amaris_BA_Cover_Letter.pdf',
    );
    // Missing parts are dropped rather than leaving dangling separators.
    assert.equal(documentFileName({ jobTitle: 'Business Analyst' }), 'Business_Analyst.pdf');
    assert.equal(documentFileName({}), 'Resume.pdf');
});
