import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests-only-0123456789';

const { requireAuth, optionalAuth, currentEmail, assertOwnership, HttpError } =
    await import('../middleware/auth.js');

/** Capture what a middleware sends instead of writing to a socket. */
function fakeRes() {
    return {
        statusCode: null,
        payload: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.payload = body; return this; },
    };
}

const run = (middleware, req) => new Promise((resolve) => {
    const res = fakeRes();
    middleware(req, res, () => resolve({ res, nexted: true }));
    // Middleware that responded rather than calling next() resolves here.
    setImmediate(() => resolve({ res, nexted: false }));
});

const sign = (payload, opts) => jwt.sign(payload, process.env.JWT_SECRET, opts);

test('requireAuth rejects a request with no Authorization header', async () => {
    const { res, nexted } = await run(requireAuth, { headers: {} });
    assert.equal(nexted, false);
    assert.equal(res.statusCode, 401);
});

test('requireAuth rejects a malformed scheme', async () => {
    const { res } = await run(requireAuth, { headers: { authorization: 'Basic abc' } });
    assert.equal(res.statusCode, 401);
});

test('requireAuth rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ id: '1', email: 'attacker@example.com' }, 'not-the-real-secret');
    const { res } = await run(requireAuth, { headers: { authorization: `Bearer ${forged}` } });
    assert.equal(res.statusCode, 401);
});

test('requireAuth rejects an expired token', async () => {
    const expired = sign({ id: '1', email: 'ada@example.com' }, { expiresIn: '-1s' });
    const { res } = await run(requireAuth, { headers: { authorization: `Bearer ${expired}` } });
    assert.equal(res.statusCode, 401);
    assert.match(res.payload.message, /expired/i);
});

test('requireAuth rejects a valid token with no email claim', async () => {
    const token = sign({ id: '1' });
    const { res } = await run(requireAuth, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.statusCode, 401);
});

test('requireAuth accepts a valid token and sets req.user', async () => {
    const token = sign({ id: 'abc', email: 'ada@example.com' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const { nexted } = await run(requireAuth, req);
    assert.equal(nexted, true);
    assert.equal(currentEmail(req), 'ada@example.com');
});

test('optionalAuth allows anonymous requests through', async () => {
    const req = { headers: {} };
    const { nexted } = await run(optionalAuth, req);
    assert.equal(nexted, true);
    assert.equal(currentEmail(req), undefined);
});

test('assertOwnership rejects a resource belonging to someone else', () => {
    const req = { user: { email: 'ada@example.com' } };
    // 404 not 403: a 403 would confirm the record exists to anyone probing ids.
    assert.throws(() => assertOwnership(req, 'someone.else@example.com'),
        (err) => err instanceof HttpError && err.status === 404);
});

test('assertOwnership passes for the owner', () => {
    const req = { user: { email: 'ada@example.com' } };
    assert.doesNotThrow(() => assertOwnership(req, 'ada@example.com'));
});

test('assertOwnership rejects when the resource has no owner', () => {
    assert.throws(() => assertOwnership({ user: { email: 'ada@example.com' } }, null));
});
