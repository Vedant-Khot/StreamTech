require('dotenv').config();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// In-memory user store (replace with database in production)
const users = new Map();

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser((id, done) => {
    const user = users.get(id);
    done(null, user || null);
});

// Google OAuth Strategy with YouTube scope
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
    scope: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/youtube.upload'  // YouTube upload permission
    ],
    accessType: 'offline',  // Get refresh token
    prompt: 'consent'       // Always show consent to get refresh token
}, (accessToken, refreshToken, profile, done) => {
    // Find or create user
    let user = users.get(profile.id);

    if (!user) {
        user = {
            id: profile.id,
            googleId: profile.id,
            email: profile.emails?.[0]?.value || '',
            name: profile.displayName,
            avatar: profile.photos?.[0]?.value || '',
            accessToken: accessToken,
            refreshToken: refreshToken,
            createdAt: new Date()
        };
        users.set(profile.id, user);
        console.log('✨ New user created:', user.name);
    } else {
        // Update tokens on each login
        user.accessToken = accessToken;
        user.refreshToken = refreshToken;
        users.set(profile.id, user);
        console.log('👋 User logged in:', user.name);
    }

    return done(null, user);
}));

module.exports = passport;
