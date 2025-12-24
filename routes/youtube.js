/**
 * YouTube Upload Routes
 * Handles video uploads to YouTube using Data API v3
 */

const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Configure multer for video uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(os.tmpdir(), 'streamteach-youtube');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname) || '.webm';
        cb(null, 'youtube-upload-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 * 1024 // 5GB limit
    }
});

/**
 * Create OAuth2 client with user's tokens
 */
function getOAuth2Client(user) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        '/auth/google/callback'
    );

    oauth2Client.setCredentials({
        access_token: user.accessToken,
        refresh_token: user.refreshToken
    });

    return oauth2Client;
}

/**
 * POST /api/youtube/upload
 * Upload video to YouTube
 */
router.post('/upload', upload.single('video'), async (req, res) => {
    // Check authentication
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'No video file uploaded' });
    }

    const { title, description, privacy, tags } = req.body;

    if (!title) {
        fs.unlink(req.file.path, () => { });
        return res.status(400).json({ error: 'Title is required' });
    }

    console.log('📤 Starting YouTube upload:', title);

    try {
        const oauth2Client = getOAuth2Client(req.user);
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

        // Create video metadata
        const videoMetadata = {
            snippet: {
                title: title,
                description: description || '',
                tags: tags ? tags.split(',').map(t => t.trim()) : [],
                categoryId: '27' // Education category
            },
            status: {
                privacyStatus: privacy || 'private', // private, unlisted, public
                selfDeclaredMadeForKids: false
            }
        };

        // Upload video
        const response = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: videoMetadata,
            media: {
                body: fs.createReadStream(req.file.path)
            }
        });

        // Clean up temp file
        fs.unlink(req.file.path, () => { });

        const videoId = response.data.id;
        const videoUrl = `https://youtube.com/watch?v=${videoId}`;

        console.log('✅ YouTube upload complete:', videoUrl);

        res.json({
            success: true,
            videoId: videoId,
            videoUrl: videoUrl,
            title: response.data.snippet.title
        });

    } catch (error) {
        // Clean up temp file on error
        fs.unlink(req.file.path, () => { });

        console.error('❌ YouTube upload error:', error.message);

        // Handle specific errors
        if (error.code === 403) {
            return res.status(403).json({
                error: 'YouTube upload permission denied',
                message: 'Please re-login to grant YouTube upload permissions'
            });
        }

        if (error.code === 401) {
            return res.status(401).json({
                error: 'Authentication expired',
                message: 'Please login again'
            });
        }

        res.status(500).json({
            error: 'Upload failed',
            message: error.message
        });
    }
});

/**
 * GET /api/youtube/status
 * Check if user has YouTube permissions
 */
router.get('/status', (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.json({
            authenticated: false,
            hasYouTubeAccess: false
        });
    }

    // Check if user has access token (they've granted YouTube permission)
    const hasAccess = !!(req.user.accessToken);

    res.json({
        authenticated: true,
        hasYouTubeAccess: hasAccess,
        userName: req.user.name
    });
});

module.exports = router;
