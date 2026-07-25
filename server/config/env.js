import 'dotenv/config';

/**
 * Fail at boot on missing configuration rather than at the first request.
 *
 * Two of these used to have silent insecure fallbacks: SESSION_SECRET defaulted
 * to the literal 'your-secret-key', and a missing JWT_SECRET only surfaced when
 * someone tried to sign in.
 */

const REQUIRED = [
    ['MONGODB_URL', 'MongoDB connection string'],
    ['JWT_SECRET', 'secret used to sign session tokens'],
    ['SESSION_SECRET', 'secret used to sign the session cookie'],
];

// Absent means the feature degrades, not that the server is broken.
const RECOMMENDED = [
    ['OPENAI_API_KEY', 'AI email/CV/scoring features'],
    ['GMAIL_USER', 'sending email from the shared mailbox'],
    ['GMAIL_APP_PASSWORD', 'sending email from the shared mailbox'],
    ['HUNTER_API_KEY', 'contact discovery'],
    ['GOOGLE_CLIENT_ID', 'Google sign-in'],
    ['GOOGLE_CLIENT_SECRET', 'Google sign-in'],
];

const WEAK_SECRETS = new Set(['your-secret-key', 'secret', 'changeme', 'password']);

export function validateEnv({ exitOnFailure = true } = {}) {
    const missing = REQUIRED.filter(([key]) => !process.env[key]?.trim());
    const weak = REQUIRED.filter(([key]) =>
        key.endsWith('SECRET') && WEAK_SECRETS.has((process.env[key] || '').trim().toLowerCase()));

    if (process.env.NODE_ENV === 'production') {
        for (const [key] of REQUIRED) {
            const value = process.env[key] || '';
            if (key.endsWith('SECRET') && value.length > 0 && value.length < 32) {
                weak.push([key, 'shorter than 32 characters']);
            }
        }
    }

    if (missing.length || weak.length) {
        for (const [key, why] of missing) console.error(`❌ Missing required env var ${key} — ${why}.`);
        for (const [key] of weak) console.error(`❌ ${key} is set to a weak or default value. Generate one: openssl rand -hex 32`);
        if (exitOnFailure) {
            console.error('\nServer cannot start with an unsafe configuration. Fix server/.env and retry.');
            process.exit(1);
        }
        return false;
    }

    const degraded = RECOMMENDED.filter(([key]) => !process.env[key]?.trim());
    for (const [key, feature] of degraded) {
        console.warn(`⚠  ${key} is not set — ${feature} will not work.`);
    }

    return true;
}

/** Origins allowed to call the API, from CORS_ORIGINS (comma-separated). */
export const allowedOrigins = () =>
    (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);

/** Public base URL of the web client, used for OAuth redirects. */
export const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
