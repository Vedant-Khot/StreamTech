/**
 * Authentication Middleware
 */

// Check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
    }

    // For API routes, return 401
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Please log in to access this resource'
        });
    }

    // For page routes, redirect to login
    res.redirect('/login.html');
}

// Check if user is NOT authenticated (for login page)
function isNotAuthenticated(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) {
        return res.redirect('/studio.html');
    }
    next();
}

module.exports = {
    isAuthenticated,
    isNotAuthenticated
};
