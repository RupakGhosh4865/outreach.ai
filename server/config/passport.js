import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LinkedInStrategy } from 'passport-linkedin-oauth2';
import UserProfile from '../models/UserProfile.js';

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback",
    proxy: true
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        let user = await UserProfile.findOne({ $or: [{ googleId: profile.id }, { email }] });

        if (user) {
            if (!user.googleId) {
                user.googleId = profile.id;
                await user.save();
            }
            return done(null, user);
        }

        user = await UserProfile.create({
            googleId: profile.id,
            name: profile.displayName,
            email: email,
            subscription: { plan: 'free' } // Default plan
        });

        done(null, user);
    } catch (err) {
        done(err, null);
    }
}));

passport.use(new LinkedInStrategy({
    clientID: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    callbackURL: "/api/auth/linkedin/callback",
    scope: ['r_emailaddress', 'r_liteprofile'],
    state: true
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        let user = await UserProfile.findOne({ $or: [{ linkedinId: profile.id }, { email }] });

        if (user) {
            if (!user.linkedinId) {
                user.linkedinId = profile.id;
                await user.save();
            }
            return done(null, user);
        }

        user = await UserProfile.create({
            linkedinId: profile.id,
            name: profile.displayName,
            email: email,
            subscription: { plan: 'free' }
        });

        done(null, user);
    } catch (err) {
        done(err, null);
    }
}));

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
