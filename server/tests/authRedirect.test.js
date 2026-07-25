import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret-for-unit-tests-only-0123456789';
process.env.SESSION_SECRET ||= 'test-session-secret-0123456789abcdef';
process.env.MONGODB_URL ||= 'mongodb://localhost:27017/test';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:3001';

const { safeClientUrl } = await import('../routes/auth.js');

/**
 * The post-OAuth redirect carries the auth token in the URL, so the target must
 * never be an arbitrary caller-supplied origin — that would hand the token to
 * whoever asked for it.
 */

test('an allowed origin is honoured', () => {
    // Lets sign-in work when Next falls back to another port in dev.
    assert.equal(safeClientUrl('http://localhost:3001'), 'http://localhost:3001');
    assert.equal(safeClientUrl('http://localhost:3000'), 'http://localhost:3000');
});

test('an origin outside the allowlist falls back to CLIENT_URL', () => {
    for (const evil of [
        'https://evil.example.com',
        'http://localhost:3000.evil.com',
        'http://localhost:9999',
        '//evil.example.com',
        'javascript:alert(1)',
    ]) {
        assert.equal(safeClientUrl(evil), 'http://localhost:3000', `should reject ${evil}`);
    }
});

test('a missing origin falls back to CLIENT_URL', () => {
    assert.equal(safeClientUrl(''), 'http://localhost:3000');
    assert.equal(safeClientUrl(undefined), 'http://localhost:3000');
    assert.equal(safeClientUrl(null), 'http://localhost:3000');
});
