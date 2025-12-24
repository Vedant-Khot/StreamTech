/**
 * Stream Client
 * Handles client-side streaming via Socket.io
 */

class StreamClient {
    constructor() {
        this.socket = null;
        this.mediaRecorder = null;
        this.isStreaming = false;
        this.startTime = null;
        this.streamConfig = null;

        // Callbacks
        this.onStatusChange = null;
        this.onError = null;
        this.onStats = null;
    }

    /**
     * Initialize Socket.io connection
     */
    init() {
        // Load Socket.io client
        if (typeof io === 'undefined') {
            console.error('Socket.io client not loaded');
            return false;
        }

        this.socket = io();

        // Handle connection events
        this.socket.on('connect', () => {
            console.log('🔌 Connected to streaming server');
        });

        this.socket.on('disconnect', () => {
            console.log('🔌 Disconnected from streaming server');
            if (this.isStreaming) {
                this._handleStreamEnd('Disconnected from server');
            }
        });

        // Handle stream events
        this.socket.on('stream-started', (data) => {
            console.log('🔴 Stream started:', data);
            this.startTime = Date.now();
            if (this.onStatusChange) {
                this.onStatusChange('live', 'Stream is live!');
            }
        });

        this.socket.on('stream-stopped', (data) => {
            console.log('⏹️ Stream stopped:', data);
            this._handleStreamEnd('Stream ended');
        });

        this.socket.on('stream-error', (data) => {
            console.error('❌ Stream error:', data);
            if (this.onError) {
                this.onError(data.message);
            }
            this._handleStreamEnd(data.message);
        });

        console.log('📡 StreamClient initialized');
        return true;
    }

    /**
     * Start streaming
     */
    async start(videoStream, audioStream, config) {
        if (this.isStreaming) {
            console.warn('Already streaming');
            return false;
        }

        if (!this.socket || !this.socket.connected) {
            console.error('Not connected to server');
            if (this.onError) {
                this.onError('Not connected to server');
            }
            return false;
        }

        const { rtmpUrl, streamKey, width, height, fps, bitrate } = config;

        if (!rtmpUrl) {
            if (this.onError) {
                this.onError('RTMP URL is required');
            }
            return false;
        }

        this.streamConfig = config;

        // Combine video and audio streams
        let combinedStream;
        if (audioStream) {
            const audioTracks = audioStream.getAudioTracks();
            const videoTracks = videoStream.getVideoTracks();
            combinedStream = new MediaStream([...videoTracks, ...audioTracks]);
        } else {
            combinedStream = videoStream;
        }

        // Create MediaRecorder
        const mimeType = this._getSupportedMimeType();
        if (!mimeType) {
            if (this.onError) {
                this.onError('No supported video format');
            }
            return false;
        }

        try {
            this.mediaRecorder = new MediaRecorder(combinedStream, {
                mimeType: mimeType,
                videoBitsPerSecond: (config.bitrate || 4500) * 1000
            });

            // Send video chunks to server
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0 && this.isStreaming) {
                    event.data.arrayBuffer().then(buffer => {
                        this.socket.emit('stream-data', buffer);
                    });
                }
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                if (this.onError) {
                    this.onError('Recording error: ' + event.error.message);
                }
            };

            // Tell server to start stream
            this.socket.emit('start-stream', {
                rtmpUrl,
                streamKey,
                width: width || 1920,
                height: height || 1080,
                fps: fps || 30,
                bitrate: bitrate || 4500
            });

            // Start recording with small timeslice for low latency
            this.mediaRecorder.start(1000); // Send data every second
            this.isStreaming = true;
            this.startTime = Date.now();

            if (this.onStatusChange) {
                this.onStatusChange('connecting', 'Connecting to stream...');
            }

            console.log('🎬 Streaming started');
            return true;

        } catch (error) {
            console.error('Failed to start streaming:', error);
            if (this.onError) {
                this.onError('Failed to start streaming: ' + error.message);
            }
            return false;
        }
    }

    /**
     * Stop streaming
     */
    stop() {
        if (!this.isStreaming) {
            return;
        }

        console.log('⏹️ Stopping stream...');

        // Stop MediaRecorder
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        // Tell server to stop
        if (this.socket) {
            this.socket.emit('stop-stream');
        }

        this._handleStreamEnd('Stream stopped by user');
    }

    /**
     * Handle stream end
     */
    _handleStreamEnd(reason) {
        this.isStreaming = false;
        this.mediaRecorder = null;

        if (this.onStatusChange) {
            this.onStatusChange('offline', reason);
        }
    }

    /**
     * Get supported MIME type
     */
    _getSupportedMimeType() {
        const types = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return null;
    }

    /**
     * Get stream duration
     */
    getDuration() {
        if (!this.isStreaming || !this.startTime) {
            return 0;
        }
        return Math.round((Date.now() - this.startTime) / 1000);
    }

    /**
     * Get formatted duration
     */
    getFormattedDuration() {
        const seconds = this.getDuration();
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// Create global instance
const streamClient = new StreamClient();
