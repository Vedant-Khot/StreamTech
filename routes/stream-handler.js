/**
 * Stream Handler
 * Handles real-time video streaming via Socket.io and FFmpeg
 */

const { spawn } = require('child_process');
const path = require('path');

class StreamHandler {
    constructor(io) {
        this.io = io;
        this.streams = new Map(); // userId -> stream info
    }

    /**
     * Initialize Socket.io handlers
     */
    init() {
        this.io.on('connection', (socket) => {
            console.log('📡 Client connected:', socket.id);

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

        console.log('🎬 StreamHandler initialized');
    }

    /**
     * Start a new stream for a client
     */
    _startStream(socket, config) {
        const { rtmpUrl, streamKey, width = 1920, height = 1080, fps = 30, bitrate = 4500 } = config;

        if (!rtmpUrl) {
            socket.emit('stream-error', { message: 'RTMP URL is required' });
            return;
        }

        // Stop any existing stream for this socket
        this._stopStream(socket);

        const fullRtmpUrl = streamKey ? `${rtmpUrl}/${streamKey}` : rtmpUrl;

        console.log(`🔴 Starting stream for ${socket.id}`);
        console.log(`   Resolution: ${width}x${height} @ ${fps}fps`);
        console.log(`   Bitrate: ${bitrate}kbps`);
        console.log(`   RTMP URL: ${rtmpUrl.substring(0, 50)}...`);

        try {
            // Build optimized FFmpeg arguments
            const ffmpegArgs = this._buildFFmpegArgs(fullRtmpUrl, {
                width, height, fps, bitrate
            });

            const ffmpeg = spawn('ffmpeg', ffmpegArgs);

            // Store stream info
            this.streams.set(socket.id, {
                ffmpeg,
                startTime: Date.now(),
                bytesReceived: 0,
                config
            });

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

            socket.emit('stream-started', {
                message: 'Stream started successfully',
                startTime: Date.now()
            });

        } catch (error) {
            console.error('❌ Failed to start stream:', error);
            socket.emit('stream-error', { message: 'Failed to start stream: ' + error.message });
        }
    }

    /**
     * Handle incoming video data
     */
    _handleData(socket, data) {
        const streamInfo = this.streams.get(socket.id);
        if (!streamInfo || !streamInfo.ffmpeg) {
            return;
        }

        try {
            // Check if stdin is writable
            if (streamInfo.ffmpeg.stdin && !streamInfo.ffmpeg.stdin.destroyed) {
                const buffer = Buffer.from(data);
                streamInfo.ffmpeg.stdin.write(buffer, (err) => {
                    if (err) {
                        console.error('Write error:', err.message);
                        // Don't stop, FFmpeg might recover
                    }
                });
                streamInfo.bytesReceived += buffer.length;
            }
        } catch (error) {
            console.error('Error writing to FFmpeg:', error.message);
            // Stop the stream if we can't write
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
                '-preset', 'ultrafast',  // Fastest preset for lowest CPU
                '-tune', 'zerolatency',  // Optimized for streaming
                '-profile:v', 'baseline', // Simpler profile = less CPU
                '-level', '3.1',
                '-b:v', `${bitrate}k`,
                '-maxrate', `${bitrate}k`,
                '-bufsize', `${Math.floor(bitrate / 2)}k`,  // Smaller buffer
                '-threads', '4',  // Limit encoder threads
                '-x264-params', 'nal-hrd=cbr:force-cfr=1'  // Constant bitrate
            );
            console.log('   Using: libx264 ultrafast (software, optimized)');
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
