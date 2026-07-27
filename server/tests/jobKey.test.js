import test from 'node:test';
import assert from 'node:assert/strict';

import { jobKey, normalizeJob } from '../services/jobSources/shared.js';

/**
 * `jobKey` is the identity the applied-jobs ledger is stored under. If two
 * listings of the same posting produce different keys, the job is offered again
 * on the next scan and the user applies twice — the problem the ledger exists to
 * stop. These cover the ways the same posting shows up looking different.
 */

test('the same posting through different tracking links shares one key', () => {
    const base = 'https://www.linkedin.com/jobs/view/12345';
    const keys = [
        base,
        `${base}/`,
        `${base}?utm_source=google&utm_campaign=x`,
        `${base}?refId=abc&trackingId=def`,
        `http://linkedin.com/jobs/view/12345`,
        `https://LinkedIn.com/Jobs/view/12345#apply`,
    ].map((url) => jobKey('Backend Engineer', 'Acme', url));

    assert.equal(new Set(keys).size, 1, `expected one key, got ${JSON.stringify([...new Set(keys)])}`);
});

test('different postings do not collide', () => {
    const a = jobKey('Backend Engineer', 'Acme', 'https://example.com/jobs/1');
    const b = jobKey('Backend Engineer', 'Acme', 'https://example.com/jobs/2');
    assert.notEqual(a, b);
});

test('a query parameter that identifies the job is preserved', () => {
    // Only tracking params are stripped — dropping a real id would merge two
    // distinct postings into one and hide the second from the user.
    const a = jobKey('Engineer', 'Acme', 'https://boards.example.com/apply?gh_jid=99');
    const b = jobKey('Engineer', 'Acme', 'https://boards.example.com/apply?gh_jid=100');
    assert.notEqual(a, b);
});

test('URL-less postings fall back to title and company, ignoring formatting', () => {
    const a = jobKey('Senior  Backend Engineer', 'Acme Ltd.', '');
    const b = jobKey('senior backend engineer', 'acme ltd', null);
    assert.equal(a, b);
    assert.match(a, /^tc:/);
});

test('a posting with neither a URL nor a title has no key', () => {
    // Better to record nothing than to file every unidentifiable job under one
    // shared key, which would suppress unrelated postings.
    assert.equal(jobKey('', '', ''), null);
});

test('normalizeJob leaves a missing applyUrl undefined', () => {
    // '' is a real value that two URL-less jobs would collide on under the
    // sparse unique index on (userEmail, applyUrl).
    assert.equal(normalizeJob({ title: 'Dev', company: 'Acme', source: 'google' }).applyUrl, undefined);
});
