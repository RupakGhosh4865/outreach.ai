import test from 'node:test';
import assert from 'node:assert/strict';

import { isRetryable, isQuotaError } from '../services/llm.js';

/**
 * Regression guard for silently-blank generated content.
 *
 * The OpenAI SDK reports a dropped or slow connection as APIConnectionError /
 * APIConnectionTimeoutError, and those carry neither `status` nor `code`. The
 * classifier only looked at those two fields, so the most common transient
 * failure was treated as permanent: one timeout failed the whole call, and the
 * outreach wizard landed on step 3 with an empty subject and body.
 */

/** Shaped like what the SDK actually throws — note the undefined status/code. */
const connectionTimeout = () => {
    const err = new Error('Request timed out.');
    err.name = 'APIConnectionTimeoutError';
    err.status = undefined;
    err.code = undefined;
    return err;
};

test('a connection timeout is retryable', () => {
    assert.ok(isRetryable(connectionTimeout()));
});

test('a dropped connection is retryable', () => {
    const err = new Error('Connection error.');
    err.name = 'APIConnectionError';
    assert.ok(isRetryable(err));
});

test('transient socket and DNS failures are retryable', () => {
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND']) {
        assert.ok(isRetryable(Object.assign(new Error(code), { code })), `${code} should retry`);
    }
});

test('server-side and rate-limit statuses are retryable', () => {
    for (const status of [408, 409, 429, 500, 502, 503, 504]) {
        assert.ok(isRetryable({ status }), `${status} should retry`);
    }
});

test('an exhausted quota is not retryable', () => {
    // Retrying this only buries the real cause under retry noise — the account
    // is out of credit and no number of attempts will change that.
    const err = Object.assign(new Error('You exceeded your current quota'), { status: 429 });
    assert.ok(isQuotaError(err));
    assert.ok(!isRetryable(err));
});

test('a genuine client error is not retryable', () => {
    assert.ok(!isRetryable({ status: 400 }));
    assert.ok(!isRetryable({ status: 401 }));
    assert.ok(!isRetryable(new Error('something else entirely')));
});
