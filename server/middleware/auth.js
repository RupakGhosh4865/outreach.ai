import jwt from 'jsonwebtoken';

import JobApplication from '../models/JobApplication.js';
import DiscoveredJob from '../models/DiscoveredJob.js';

/**
 * Authentication and ownership.
 *
 * Every business route used to identify the caller by a `userEmail` they supplied
 * in the query or body, and `:id` routes did no ownership check at all — so any
 * caller could read or mutate anyone's profile, history, applications and CVs.
 * The identity now comes from the signed token and nowhere else.
 */

export class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function verify(token) {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        throw new HttpError(401, err.name === 'TokenExpiredError' ? 'Session expired — sign in again.' : 'Invalid token.');
    }
}

const bearer = (req) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

/** Reject anything without a valid token. */
export function requireAuth(req, res, next) {
    const token = bearer(req);
    if (!token) return res.status(401).json({ message: 'Authentication required.' });

    try {
        const decoded = verify(token);
        if (!decoded?.email) return res.status(401).json({ message: 'Token is missing an email claim.' });
        req.user = { id: decoded.id, email: decoded.email };
        next();
    } catch (err) {
        res.status(err.status || 401).json({ message: err.message });
    }
}

/** Attach `req.user` when a valid token is present, but allow anonymous access. */
export function optionalAuth(req, res, next) {
    const token = bearer(req);
    if (token) {
        try {
            const decoded = verify(token);
            if (decoded?.email) req.user = { id: decoded.id, email: decoded.email };
        } catch { /* anonymous */ }
    }
    next();
}

/**
 * The authenticated user's email — the only trustworthy source of "who is this".
 * Routes should use this instead of `req.body.userEmail` / `req.query.userEmail`.
 */
export const currentEmail = (req) => req.user?.email;

/** Throw unless the resource belongs to the caller. */
export function assertOwnership(req, ownerEmail) {
    if (!ownerEmail || ownerEmail !== currentEmail(req)) {
        // 404 rather than 403: a 403 confirms the id exists, which leaks the
        // existence of other users' records to anyone probing ids.
        throw new HttpError(404, 'Not found.');
    }
}

/** Load a document by `:id` and confirm the caller owns it. */
const loadOwned = (Model, label) => async (req) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw new HttpError(404, `${label} not found.`);
    assertOwnership(req, doc.userEmail);
    return doc;
};

export const loadOwnedApplication = loadOwned(JobApplication, 'Application');
export const loadOwnedDiscoveredJob = loadOwned(DiscoveredJob, 'Job');
