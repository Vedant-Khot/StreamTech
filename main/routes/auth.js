const express = require('express');
const passport = require('passport');
const router = express.Router();

// Initiate Google OAuth flow
router.get('/google', passport.authenticate('google', {
    scope: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/youtube.upload'
    ],
    accessType: 'offline',
    prompt: 'consent'  // Force consent screen to get new permissions
}));

// Google OAuth callback
router.get('/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/login.html?error=auth_failed',
        successRedirect: '/studio.html'
    })
);

// Logout
router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
            return next(err);
        }
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
            }
            res.redirect('/');
        });
    });
});

// Get current user info (API endpoint)
router.get('/user', (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
        const user = req.user;
        res.json({
            authenticated: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: user.avatar
            }
        });
    } else {
        res.json({
            authenticated: false,
            user: null
        });
    }
});

module.exports = router;
