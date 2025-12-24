require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('./config/passport');
const http = require('http');
const { Server } = require('socket.io');
const StreamHandler = require('./routes/stream-handler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true
    },
    maxHttpBufferSize: 10 * 1024 * 1024 // 10MB for video chunks
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Auth routes
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

// Convert routes (video format conversion)
const convertRoutes = require('./routes/convert');
app.use('/api', convertRoutes);

// YouTube routes (video upload)
const youtubeRoutes = require('./routes/youtube');
app.use('/api/youtube', youtubeRoutes);

// API: Get current user
app.get('/api/user', (req, res) => {
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

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize Stream Handler with Socket.io
const streamHandler = new StreamHandler(io);
streamHandler.init();

// Start server with Socket.io
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📺 Live Stream Teaching Platform is ready!`);
    console.log(`📡 Socket.io streaming enabled`);

    // Check for OAuth configuration
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.log('⚠️  Warning: Google OAuth credentials not configured in .env');
    } else {
        console.log('✅ Google OAuth configured');
    }
});
