import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as OpenIDConnectStrategy } from 'passport-openidconnect';
import UserProfile from '../models/UserProfile.js';

/** First verified email on an OAuth profile, or null. */
function primaryEmail(profile) {
    const email = profile?.emails?.[0]?.value || profile?._json?.email;
    return email ? String(email).toLowerCase() : null;
}

/**
 * Find or create the account behind an OAuth identity.
 * Links the provider id onto an existing account matched by email.
 */
async function upsertOAuthUser({ idField, id, email, name }) {
    if (!email) throw new Error('This account did not return an email address, which is required to sign in.');

    let user = await UserProfile.findOne({ $or: [{ [idField]: id }, { email }] });

    if (user) {
        if (!user[idField]) {
            user[idField] = id;
            await user.save();
        }
        return user;
    }

    return UserProfile.create({
        [idField]: id,
        name: name || email.split('@')[0],
        email,
        subscription: { plan: 'free' },
    });
}

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback',
    proxy: true,
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const user = await upsertOAuthUser({
            idField: 'googleId',
            id: profile.id,
            email: primaryEmail(profile),
            name: profile.displayName,
        });

        // When the user granted send scope, keep the refresh token so outreach can
        // go out from their own mailbox instead of the shared one.
        if (refreshToken) {
            user.gmail = {
                address: primaryEmail(profile),
                refreshToken,
                connectedAt: new Date(),
            };
            await user.save();
        }

        done(null, user);
    } catch (err) {
        done(err, null);
    }
}));

/**
 * LinkedIn via OpenID Connect.
 *
 * The old passport-linkedin-oauth2 strategy requested `r_emailaddress` and
 * `r_liteprofile`, which LinkedIn retired — sign-in returned an invalid-scope
 * error. "Sign In with LinkedIn using OpenID Connect" is the supported product.
 */
if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
    passport.use('linkedin', new OpenIDConnectStrategy({
        issuer: 'https://www.linkedin.com/oauth',
        authorizationURL: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenURL: 'https://www.linkedin.com/oauth/v2/accessToken',
        userInfoURL: 'https://api.linkedin.com/v2/userinfo',
        clientID: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
        callbackURL: '/api/auth/linkedin/callback',
        scope: ['openid', 'profile', 'email'],
    }, async (issuer, profile, done) => {
        try {
            const user = await upsertOAuthUser({
                idField: 'linkedinId',
                id: profile.id,
                email: primaryEmail(profile),
                name: profile.displayName,
            });
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    }));
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await UserProfile.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

export default passport;
