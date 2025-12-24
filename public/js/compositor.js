/**
 * Video Compositor
 * Combines screen capture and webcam into a single canvas output
 */

class VideoCompositor {
    constructor() {
        // Canvas and context
        this.canvas = null;
        this.ctx = null;

        // Video sources
        this.screenVideo = null;
        this.webcamVideo = null;

        // Output settings
        this.width = 1920;
        this.height = 1080;
        this.frameRate = 30;

        // Webcam overlay settings
        this.webcamPosition = {
            x: 0,        // Will be calculated as right-aligned
            y: 0,        // Will be calculated as bottom-aligned
            width: 320,
            height: 180,
            margin: 20,
            borderRadius: 12,
            borderWidth: 3,
            borderColor: '#6366f1'
        };

        // State
        this.isRunning = false;
        this.animationFrameId = null;
        this.outputStream = null;
        this.backgroundInterval = null;  // Timer for background rendering
        this.useBackgroundRender = false;

        // Performance tracking
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.fps = 0;

        // Bind visibility change handler
        this._handleVisibilityChange = this._handleVisibilityChange.bind(this);
    }

    /**
     * Initialize the compositor with canvas element
     */
    init(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d', { alpha: false });

        // Set canvas size
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // Calculate webcam position (bottom-right)
        this._updateWebcamPosition();

        console.log('🎨 VideoCompositor initialized', `${this.width}x${this.height}`);
        return this;
    }

    /**
     * Set output resolution
     */
    setResolution(width, height) {
        this.width = width;
        this.height = height;

        if (this.canvas) {
            this.canvas.width = width;
            this.canvas.height = height;
            this._updateWebcamPosition();
        }

        console.log('📐 Resolution set to', `${width}x${height}`);
    }

    /**
     * Set resolution by quality preset
     */
    setQuality(quality) {
        switch (quality) {
            case '720p':
                this.setResolution(1280, 720);
                break;
            case '1080p':
                this.setResolution(1920, 1080);
                break;
            case '1440p':
                this.setResolution(2560, 1440);
                break;
            default:
                this.setResolution(1920, 1080);
        }
    }

    /**
     * Set frame rate
     */
    setFrameRate(fps) {
        this.frameRate = fps;
        console.log('🎬 Frame rate set to', fps, 'fps');
    }

    /**
     * Set screen video source
     */
    setScreenSource(videoElement) {
        this.screenVideo = videoElement;
    }

    /**
     * Set webcam video source
     */
    setWebcamSource(videoElement) {
        this.webcamVideo = videoElement;
    }

    /**
     * Update webcam overlay position
     */
    _updateWebcamPosition() {
        const margin = this.webcamPosition.margin;
        this.webcamPosition.x = this.width - this.webcamPosition.width - margin;
        this.webcamPosition.y = this.height - this.webcamPosition.height - margin;
    }

    /**
     * Set webcam overlay position
     */
    setWebcamPosition(position) {
        const margin = this.webcamPosition.margin;

        switch (position) {
            case 'top-left':
                this.webcamPosition.x = margin;
                this.webcamPosition.y = margin;
                break;
            case 'top-right':
                this.webcamPosition.x = this.width - this.webcamPosition.width - margin;
                this.webcamPosition.y = margin;
                break;
            case 'bottom-left':
                this.webcamPosition.x = margin;
                this.webcamPosition.y = this.height - this.webcamPosition.height - margin;
                break;
            case 'bottom-right':
            default:
                this._updateWebcamPosition();
                break;
        }
    }

    /**
     * Set webcam overlay size
     */
    setWebcamSize(width, height) {
        this.webcamPosition.width = width;
        this.webcamPosition.height = height;
        this._updateWebcamPosition();
    }

    /**
     * Start the render loop
     */
    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.lastFrameTime = performance.now();
        this.frameCount = 0;

        // Listen for visibility changes to handle background tab
        document.addEventListener('visibilitychange', this._handleVisibilityChange);

        this._render();

        // Create output stream from canvas
        this.outputStream = this.canvas.captureStream(this.frameRate);

        console.log('▶️ Compositor started');
        return this.outputStream;
    }

    /**
     * Stop the render loop
     */
    stop() {
        this.isRunning = false;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Clear background render interval
        if (this.backgroundInterval) {
            clearInterval(this.backgroundInterval);
            this.backgroundInterval = null;
        }

        // Remove visibility listener
        document.removeEventListener('visibilitychange', this._handleVisibilityChange);

        if (this.outputStream) {
            this.outputStream.getTracks().forEach(track => track.stop());
            this.outputStream = null;
        }

        console.log('⏹️ Compositor stopped');
    }

    /**
     * Handle tab visibility change - use timer when hidden
     */
    _handleVisibilityChange() {
        if (document.hidden) {
            // Tab is hidden - switch to setInterval for consistent rendering
            console.log('👁️ Tab hidden - switching to background render');
            this.useBackgroundRender = true;

            // Stop animation frame
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }

            // Start interval-based rendering
            const frameInterval = 1000 / this.frameRate;
            this.backgroundInterval = setInterval(() => {
                if (this.isRunning) {
                    this._drawFrame();
                }
            }, frameInterval);
        } else {
            // Tab is visible - switch back to requestAnimationFrame
            console.log('👁️ Tab visible - switching to foreground render');
            this.useBackgroundRender = false;

            // Stop interval
            if (this.backgroundInterval) {
                clearInterval(this.backgroundInterval);
                this.backgroundInterval = null;
            }

            // Resume animation frame
            if (this.isRunning && !this.animationFrameId) {
                this._render();
            }
        }
    }

    /**
     * Main render loop
     */
    _render() {
        if (!this.isRunning) return;

        const now = performance.now();
        const elapsed = now - this.lastFrameTime;
        const frameInterval = 1000 / this.frameRate;

        // Only render at target frame rate
        if (elapsed >= frameInterval) {
            this._drawFrame();

            // Update FPS counter
            this.frameCount++;
            if (now - this.lastFrameTime >= 1000) {
                this.fps = this.frameCount;
                this.frameCount = 0;
            }

            this.lastFrameTime = now - (elapsed % frameInterval);
        }

        this.animationFrameId = requestAnimationFrame(() => this._render());
    }

    /**
     * Draw a single frame
     */
    _drawFrame() {
        const ctx = this.ctx;

        // Clear canvas with black background
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, this.width, this.height);

        const hasScreen = this.screenVideo && this.screenVideo.readyState >= 2 && this.screenVideo.srcObject;
        const hasWebcam = this.webcamVideo && this.webcamVideo.readyState >= 2 && this.webcamVideo.srcObject;

        if (hasScreen) {
            // Draw screen capture (scaled to fit)
            this._drawScreenCapture();

            // Draw webcam as overlay if also active
            if (hasWebcam) {
                this._drawWebcamOverlay();
            }
        } else if (hasWebcam) {
            // Only webcam active - draw it fullscreen
            this._drawWebcamFullscreen();
        }
    }

    /**
     * Draw screen capture to canvas
     */
    _drawScreenCapture() {
        const video = this.screenVideo;
        const ctx = this.ctx;

        // Calculate aspect ratio fit
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = this.width / this.height;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (videoAspect > canvasAspect) {
            // Video is wider - fit to width
            drawWidth = this.width;
            drawHeight = this.width / videoAspect;
            offsetX = 0;
            offsetY = (this.height - drawHeight) / 2;
        } else {
            // Video is taller - fit to height
            drawHeight = this.height;
            drawWidth = this.height * videoAspect;
            offsetX = (this.width - drawWidth) / 2;
            offsetY = 0;
        }

        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
    }

    /**
     * Draw webcam overlay with rounded corners and border
     */
    _drawWebcamOverlay() {
        const video = this.webcamVideo;
        const ctx = this.ctx;
        const pos = this.webcamPosition;

        ctx.save();

        // Create rounded rectangle path
        this._roundRect(pos.x, pos.y, pos.width, pos.height, pos.borderRadius);
        ctx.clip();

        // Draw webcam video (mirrored horizontally)
        ctx.translate(pos.x + pos.width, pos.y);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, pos.width, pos.height);

        ctx.restore();

        // Draw border
        ctx.save();
        ctx.strokeStyle = pos.borderColor;
        ctx.lineWidth = pos.borderWidth;
        this._roundRect(pos.x, pos.y, pos.width, pos.height, pos.borderRadius);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Draw webcam fullscreen (when no screen capture active)
     */
    _drawWebcamFullscreen() {
        const video = this.webcamVideo;
        const ctx = this.ctx;

        // Calculate aspect ratio fit
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = this.width / this.height;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (videoAspect > canvasAspect) {
            // Video is wider - fit to width
            drawWidth = this.width;
            drawHeight = this.width / videoAspect;
            offsetX = 0;
            offsetY = (this.height - drawHeight) / 2;
        } else {
            // Video is taller - fit to height
            drawHeight = this.height;
            drawWidth = this.height * videoAspect;
            offsetX = (this.width - drawWidth) / 2;
            offsetY = 0;
        }

        // Draw mirrored (selfie mode)
        ctx.save();
        ctx.translate(this.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, this.width - offsetX - drawWidth, offsetY, drawWidth, drawHeight);
        ctx.restore();
    }

    /**
     * Helper to create rounded rectangle path
     */
    _roundRect(x, y, width, height, radius) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    /**
     * Get the output MediaStream
     */
    getOutputStream() {
        return this.outputStream;
    }

    /**
     * Get current FPS
     */
    getFPS() {
        return this.fps;
    }
}

// Create global instance
const videoCompositor = new VideoCompositor();
