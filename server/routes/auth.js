import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';

import { allowedOrigins, clientUrl } from '../config/env.js';
import { requireAuth, currentEmail } from '../middleware/auth.js';
import UserProfile from '../models/UserProfile.js';

const router = express.Router();

const generateToken = (user) => jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
);

/**
 * Decide where to send the user after OAuth.
 *
 * The client tells us its own origin when starting the flow, because in dev
 * Next silently moves to another port when 3000 is taken — and a redirect to a
 * hardcoded CLIENT_URL then delivers the token to a port nothing is listening on.
 *
 * The candidate is only honoured if it is in the CORS allowlist. Redirecting to
 * an arbitrary caller-supplied URL would be an open redirect that hands the
 * auth token to whoever asked.
 */
export function safeClientUrl(candidate) {
    if (!candidate) return clientUrl();
    return allowedOrigins().includes(candidate) ? candidate : clientUrl();
}

/**
 * Remember the initiating origin for the length of the OAuth round trip.
 * It lives in the session rather than the `state` parameter so passport keeps
 * using `state` for its own CSRF protection.
 */
function rememberOrigin(req) {
    const candidate = typeof req.query.origin === 'string' ? req.query.origin.replace(/\/$/, '') : '';
    req.session.oauthOrigin = safeClientUrl(candidate);
}

const originFor = (req) => req.session?.oauthOrigin || clientUrl();

/** Hand the token to the client via its callback page. */
const completeLogin = (req, res) => {
    const token = generateToken(req.user);
    const target = originFor(req);
    delete req.session.oauthOrigin;
    res.redirect(`${target}/auth-callback?token=${encodeURIComponent(token)}`);
};

/** Failure redirects resolve the same way, so errors land on the right port too. */
const onFailure = (req, res) => res.redirect(`${originFor(req)}/login?error=auth_failed`);

// ── Google ───────────────────────────────────────────────────────────────────
router.get('/google', (req, res, next) => {
    rememberOrigin(req);
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

/**
 * Opt-in upgrade: re-consent with Gmail send scope so this user's outreach goes
 * out from their own mailbox. `access_type=offline` + `prompt=consent` is what
 * makes Google return the refresh token we need to send later.
 */
router.get('/google/connect-gmail', (req, res, next) => {
    rememberOrigin(req);
    passport.authenticate('google', {
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.send'],
        accessType: 'offline',
        prompt: 'consent',
    })(req, res, next);
});

// `failureRedirect` is resolved once at module load, so it can't know the
// initiating origin — a custom failure handler is used instead.
router.get('/google/callback',
    (req, res, next) => passport.authenticate('google', { session: false }, (err, user) => {
        if (err || !user) return onFailure(req, res);
        req.user = user;
        next();
    })(req, res, next),
    completeLogin,
);

// ── LinkedIn (OpenID Connect) ────────────────────────────────────────────────
router.get('/linkedin', (req, res, next) => {
    rememberOrigin(req);
    if (!process.env.LINKEDIN_CLIENT_ID) {
        return res.redirect(`${originFor(req)}/login?error=linkedin_not_configured`);
    }
    passport.authenticate('linkedin')(req, res, next);
});

router.get('/linkedin/callback',
    (req, res, next) => passport.authenticate('linkedin', { session: false }, (err, user) => {
        if (err || !user) return onFailure(req, res);
        req.user = user;
        next();
    })(req, res, next),
    completeLogin,
);

// ── Session ──────────────────────────────────────────────────────────────────
// GET /api/auth/me — the client uses this to validate a stored token.
router.get('/me', requireAuth, async (req, res) => {
    const profile = await UserProfile.findOne({ email: currentEmail(req) });
    res.json({
        user: req.user,
        profile,
        // Whether outreach sends from this user's own mailbox or the shared one.
        gmailConnected: Boolean(profile?.gmail?.connectedAt),
    });
});

// POST /api/auth/disconnect-gmail — revert to sending via the shared mailbox.
router.post('/disconnect-gmail', requireAuth, async (req, res) => {
    await UserProfile.updateOne(
        { email: currentEmail(req) },
        { $set: { gmail: { address: null, refreshToken: null, connectedAt: null } } },
    );
    res.json({ message: 'Gmail disconnected. Outreach will send from the shared mailbox.' });
});

export default router;
