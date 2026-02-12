/**
 * Stream Handler
 * Handles real-time video streaming via Socket.io and FFmpeg
 */

const { spawn } = require('child_process');
const path = require('path');

class StreamHandler {
    constructor(io, sessionMiddleware, passport) {
        this.io = io;
        this.sessionMiddleware = sessionMiddleware;
        this.passport = passport;
        this.streams = new Map(); // userId -> stream info
    }

    /**
     * Initialize Socket.io handlers
     */
    init() {
        // middleware wrapper for socket.io
        const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

        // Use session middleware
        this.io.use(wrap(this.sessionMiddleware));

        // Use passport middleware
        this.io.use(wrap(this.passport.initialize()));
        this.io.use(wrap(this.passport.session()));

        // Auth check middleware
        this.io.use((socket, next) => {
            if (socket.request.user) {
                next();
            } else {
                next(new Error('unauthorized'));
            }
        });

        this.io.on('connection', (socket) => {
            console.log(`📡 Client connected: ${socket.id} (User: ${socket.request.user.name})`);

            // Handle stream start
            socket.on('start-stream', (config) => this._startStream(socket, config));

            // Handle video data chunks
            socket.on('stream-data', (data) => this._handleData(socket, data));

            // Handle stream stop
            socket.on('stop-stream', () => this._stopStream(socket));

            // Handle disconnect
            socket.on('disconnect', () => {
                console.log('📡 Client disconnected:', socket.id);
                this._stopStream(socket);
            });
        });

        console.log('🎬 StreamHandler initialized with Authentication');
    }

    /**
     * Start a new stream for a client
     */
    _startStream(socket, config) {
        const { rtmpUrl, streamKey, width = 1280, height = 720, fps = 30, bitrate = 3000 } = config;

        if (!rtmpUrl) {
            socket.emit('stream-error', { message: 'RTMP URL is required' });
            return;
        }

        // Stop any existing stream for this socket
        this._stopStream(socket);

        console.log(`🔴 Stream requested for ${socket.id}`);
        console.log(`   Buffering data before launch...`);

        // Initialize stream info WITHOUT FFmpeg (waiting for buffer)
        this.streams.set(socket.id, {
            ffmpeg: null,  // Will be set later
            startTime: Date.now(),
            bytesReceived: 0,
            config,
            buffer: [],    // Initialize buffer
            bufferSize: 0
        });

        socket.emit('stream-started', {
            message: 'Stream initialized, buffering...',
            startTime: Date.now()
        });
    }

    /**
     * Launch FFmpeg process after buffering
     */
    _launchFFmpeg(socket, config) {
        const { rtmpUrl, streamKey, width = 1280, height = 720, fps = 30, bitrate = 3000 } = config;
        const fullRtmpUrl = streamKey ? `${rtmpUrl}/${streamKey}` : rtmpUrl;

        console.log(`� Launching FFmpeg for ${socket.id}`);
        console.log(`   Resolution: ${width}x${height} @ ${fps}fps`);
        console.log(`   Bitrate: ${bitrate}kbps`);

        try {
            // Build optimized FFmpeg arguments
            const ffmpegArgs = this._buildFFmpegArgs(fullRtmpUrl, {
                width, height, fps, bitrate
            });

            const ffmpeg = spawn('ffmpeg', ffmpegArgs);

            // Update stream info with running process
            const streamInfo = this.streams.get(socket.id);
            if (streamInfo) {
                streamInfo.ffmpeg = ffmpeg;

                // Flush buffer immediately
                if (streamInfo.buffer && streamInfo.buffer.length > 0) {
                    console.log(`⚡ Flushing ${streamInfo.buffer.length} pre-buffered chunks...`);
                    for (const chunk of streamInfo.buffer) {
                        try {
                            if (ffmpeg.stdin && !ffmpeg.stdin.destroyed) {
                                ffmpeg.stdin.write(chunk);
                            }
                        } catch (e) {
                            console.error('Error writing buffer:', e);
                        }
                    }
                    streamInfo.buffer = []; // Clear buffer
                    streamInfo.bufferSize = 0;
                }
            }

            // Handle stdin errors (EPIPE when FFmpeg dies)
            ffmpeg.stdin.on('error', (err) => {
                if (err.code === 'EPIPE') {
                    console.log('⚠️ FFmpeg stdin pipe closed (stream may have ended)');
                } else {
                    console.error('❌ FFmpeg stdin error:', err.message);
                }
            });

            // Handle FFmpeg stdout
            ffmpeg.stdout.on('data', (data) => {
                // Usually empty for RTMP output
            });

            // Handle FFmpeg stderr (progress info)
            ffmpeg.stderr.on('data', (data) => {
                const output = data.toString();
                // Parse frame/fps info if needed
                if (output.includes('frame=')) {
                    // Could emit progress updates
                }
            });

            // Handle FFmpeg errors
            ffmpeg.on('error', (err) => {
                console.error('❌ FFmpeg error:', err.message);
                socket.emit('stream-error', { message: 'FFmpeg error: ' + err.message });
                this._stopStream(socket);
            });

            // Handle FFmpeg exit
            ffmpeg.on('close', (code) => {
                console.log(`⏹️ FFmpeg exited with code ${code}`);
                if (code !== 0 && this.streams.has(socket.id)) {
                    socket.emit('stream-error', { message: `Stream ended unexpectedly (code ${code})` });
                }
                this.streams.delete(socket.id);
            });

        } catch (error) {
            console.error('❌ Failed to launch FFmpeg:', error);
            socket.emit('stream-error', { message: 'Failed to launch stream: ' + error.message });
            this._stopStream(socket);
        }
    }

    _handleData(socket, data) {
        const streamInfo = this.streams.get(socket.id);

        // If no stream info, we can't do anything
        if (!streamInfo) return;

        try {
            const buffer = Buffer.from(data);

            // If FFmpeg is running, write directly
            if (streamInfo.ffmpeg && streamInfo.ffmpeg.stdin && !streamInfo.ffmpeg.stdin.destroyed) {
                // If we have a backlog buffer, flush it first
                if (streamInfo.buffer && streamInfo.buffer.length > 0) {
                    console.log(`🚀 Flushing ${streamInfo.buffer.length} buffered chunks to FFmpeg`);
                    for (const chunk of streamInfo.buffer) {
                        streamInfo.ffmpeg.stdin.write(chunk);
                    }
                    streamInfo.buffer = []; // Clear buffer
                }

                // Write current chunk
                streamInfo.ffmpeg.stdin.write(buffer, (err) => {
                    if (err) {
                        console.error('Write error:', err.message);
                    }
                });
                streamInfo.bytesReceived += buffer.length;
            }
            // If FFmpeg is NOT running yet (buffering phase)
            else if (!streamInfo.ffmpeg) {
                // Initialize buffer if needed
                if (!streamInfo.buffer) {
                    streamInfo.buffer = [];
                    streamInfo.bufferSize = 0;
                }

                // Add to buffer
                streamInfo.buffer.push(buffer);
                streamInfo.bufferSize += buffer.length;
                streamInfo.bytesReceived += buffer.length;

                // Check if we should start FFmpeg (e.g., > 1MB buffered or > 10 chunks)
                // This pre-buffering ensures we have enough data to start smoothly
                const START_THRESHOLD = 512 * 1024; // 512KB

                if (streamInfo.bufferSize > START_THRESHOLD) {
                    console.log(`⚡ Buffer full (${(streamInfo.bufferSize / 1024).toFixed(2)}KB), launching FFmpeg...`);
                    this._launchFFmpeg(socket, streamInfo.config);
                }
            }
        } catch (error) {
            console.error('Error handling stream data:', error.message);
            this._stopStream(socket);
        }
    }

    /**
     * Stop a stream
     */
    _stopStream(socket) {
        const streamInfo = this.streams.get(socket.id);
        if (!streamInfo) return;

        console.log(`⏹️ Stopping stream for ${socket.id}`);

        try {
            // Close FFmpeg stdin to signal end
            if (streamInfo.ffmpeg && streamInfo.ffmpeg.stdin) {
                streamInfo.ffmpeg.stdin.end();
            }

            // Kill FFmpeg process
            if (streamInfo.ffmpeg) {
                streamInfo.ffmpeg.kill('SIGTERM');
            }

            const duration = Math.round((Date.now() - streamInfo.startTime) / 1000);
            const mbReceived = (streamInfo.bytesReceived / (1024 * 1024)).toFixed(2);

            console.log(`   Duration: ${duration}s, Data: ${mbReceived}MB`);

            socket.emit('stream-stopped', {
                duration,
                bytesReceived: streamInfo.bytesReceived
            });

        } catch (error) {
            console.error('Error stopping stream:', error);
        }

        this.streams.delete(socket.id);
    }

    /**
     * Get stream status
     */
    getStreamStatus(socketId) {
        const streamInfo = this.streams.get(socketId);
        if (!streamInfo) return null;

        return {
            isStreaming: true,
            duration: Math.round((Date.now() - streamInfo.startTime) / 1000),
            bytesReceived: streamInfo.bytesReceived,
            config: streamInfo.config
        };
    }

    /**
     * Build optimized FFmpeg arguments
     * Tries hardware acceleration first, falls back to optimized software encoding
     */
    _buildFFmpegArgs(rtmpUrl, { width, height, fps, bitrate }) {
        const args = [
            // Reduce input buffer for lower latency
            '-fflags', 'nobuffer',
            '-flags', 'low_delay',

            // Input from stdin (WebM from browser)
            '-i', 'pipe:0',

            // Limit threads to reduce CPU usage
            '-threads', '4',
        ];

        // Try NVIDIA NVENC hardware encoding first
        // Falls back to optimized software encoding
        const useHardware = process.env.USE_HARDWARE_ENCODING === 'true';

        if (useHardware) {
            // NVIDIA NVENC (if available)
            args.push(
                '-c:v', 'h264_nvenc',
                '-preset', 'p4',  // Balanced preset for NVENC
                '-tune', 'll',   // Low latency tuning
                '-b:v', `${bitrate}k`,
                '-maxrate', `${bitrate}k`,
                '-bufsize', `${Math.floor(bitrate / 2)}k`,  // Smaller buffer for low latency
                '-rc', 'cbr',    // Constant bitrate for streaming
                '-gpu', '0'      // Use first GPU
            );
            console.log('   Using: NVIDIA NVENC (hardware)');
        } else {
            // Optimized software encoding (lower CPU usage)
            args.push(
                '-c:v', 'libx264',
                '-preset', 'veryfast',   // Better quality/bitrate balance than ultrafast
                '-tune', 'zerolatency',  // Optimized for streaming
                '-profile:v', 'main',    // Main profile is better for quality
                '-level', '3.1',
                '-b:v', `${bitrate}k`,
                '-maxrate', `${bitrate}k`,
                '-bufsize', `${bitrate * 2}k`,  // Larger buffer (2x) for stability
                '-threads', '4',
                '-x264-params', 'nal-hrd=cbr:force-cfr=1'
            );
            console.log('   Using: libx264 veryfast (software, optimized)');
        }

        // Common settings
        args.push(
            '-pix_fmt', 'yuv420p',
            '-g', String(fps * 2),  // Keyframe every 2 seconds
            '-r', String(fps),
            '-vsync', 'cfr',  // Constant frame rate

            // Skip scaling if dimensions match (reduces CPU)
            '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,

            // Audio encoding (optimized)
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-ac', '2',

            // Output format
            '-f', 'flv',

            // RTMP output
            rtmpUrl
        );

        return args;
    }
}
module.exports = StreamHandler;
