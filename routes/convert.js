/**
 * Video Conversion Routes
 * Handles WebM to MP4 conversion using FFmpeg
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(os.tmpdir(), 'streamteach-uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'recording-' + uniqueSuffix + '.webm');
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow video files and also accept application/octet-stream 
        // (browsers sometimes send blobs with incorrect MIME)
        const allowedTypes = ['video/', 'application/octet-stream'];
        const isAllowed = allowedTypes.some(type =>
            file.mimetype.startsWith(type) || file.mimetype === type
        );

        if (isAllowed || file.originalname.endsWith('.webm')) {
            cb(null, true);
        } else {
            console.log('Rejected file:', file.mimetype, file.originalname);
            cb(new Error('Only video files are allowed'));
        }
    }
});

/**
 * POST /api/convert
 * Convert uploaded WebM video to MP4
 */
router.post('/convert', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No video file uploaded' });
    }

    const inputPath = req.file.path;
    const outputPath = inputPath.replace('.webm', '.mp4');
    const format = req.body.format || 'mp4';

    console.log('🎬 Converting video:', inputPath);

    try {
        await new Promise((resolve, reject) => {
            let command = ffmpeg(inputPath);

            // Apply format-specific settings
            switch (format) {
                case 'mp4':
                    command
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .outputOptions([
                            '-preset fast',
                            '-crf 22',
                            '-movflags +faststart'
                        ]);
                    break;
                case 'mov':
                    command
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .format('mov');
                    break;
                case 'avi':
                    command
                        .videoCodec('libxvid')
                        .audioCodec('mp3')
                        .format('avi');
                    break;
                default:
                    command
                        .videoCodec('libx264')
                        .audioCodec('aac');
            }

            command
                .on('start', (cmd) => {
                    console.log('FFmpeg command:', cmd);
                })
                .on('progress', (progress) => {
                    console.log(`Progress: ${progress.percent?.toFixed(1)}%`);
                })
                .on('end', () => {
                    console.log('✅ Conversion complete');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('❌ Conversion error:', err);
                    reject(err);
                })
                .save(outputPath);
        });

        // Send the converted file
        res.download(outputPath, `recording.${format}`, (err) => {
            // Clean up temp files
            fs.unlink(inputPath, () => { });
            fs.unlink(outputPath, () => { });

            if (err) {
                console.error('Download error:', err);
            }
        });

    } catch (error) {
        // Clean up on error
        fs.unlink(inputPath, () => { });

        res.status(500).json({
            error: 'Conversion failed',
            message: error.message
        });
    }
});

/**
 * GET /api/convert/formats
 * Get available output formats
 */
router.get('/formats', (req, res) => {
    res.json({
        formats: [
            { id: 'mp4', name: 'MP4 (H.264)', extension: '.mp4', recommended: true },
            { id: 'mov', name: 'MOV (QuickTime)', extension: '.mov' },
            { id: 'webm', name: 'WebM (VP9)', extension: '.webm' },
            { id: 'avi', name: 'AVI', extension: '.avi' }
        ]
    });
});

module.exports = router;
