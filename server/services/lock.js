import crypto from 'crypto';
import Lock from '../models/Lock.js';

/** Identifies this process in lock rows — useful when debugging a stuck lock. */
export const INSTANCE_ID = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

const DEFAULT_TTL_MS = 30 * 60 * 1000;

/**
 * Try to take a named lock. Returns false when someone else holds it.
 *
 * Replaces the in-memory `running` Maps that used to guard the pipeline and radar
 * scans — those only ever protected a single process, so two replicas would both
 * happily run the same pipeline and send the same email twice.
 */
export async function acquireLock(key, { ttlMs = DEFAULT_TTL_MS } = {}) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    try {
        await Lock.create({ key, owner: INSTANCE_ID, acquiredAt: now, expiresAt });
        return true;
    } catch (err) {
        if (err.code !== 11000) throw err; // 11000 = duplicate key = already held

        // The TTL monitor only runs every ~60s, so also reclaim on read.
        const stolen = await Lock.findOneAndUpdate(
            { key, expiresAt: { $lte: now } },
            { $set: { owner: INSTANCE_ID, acquiredAt: now, expiresAt } },
        );
        return Boolean(stolen);
    }
}

/** Release a lock we hold. Never throws — a failed release self-heals via the TTL. */
export async function releaseLock(key) {
    try {
        await Lock.deleteOne({ key, owner: INSTANCE_ID });
    } catch (err) {
        console.warn(`[Lock] Could not release "${key}":`, err.message);
    }
}

/** True when the named lock is currently held by anyone. */
export async function isLocked(key) {
    const held = await Lock.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
    return Boolean(held);
}

/**
 * Run `fn` under a lock. Returns `{ ran: false }` without calling `fn` when the
 * lock is already held, so callers can report "already in progress" rather than
 * starting competing work.
 */
export async function withLock(key, fn, { ttlMs = DEFAULT_TTL_MS } = {}) {
    if (!(await acquireLock(key, { ttlMs }))) return { ran: false };
    try {
        return { ran: true, value: await fn() };
    } finally {
        await releaseLock(key);
    }
}
