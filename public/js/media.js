/**
 * Media Manager
 * Handles screen capture, webcam, and microphone streams
 */

class MediaManager {
    constructor() {
        // Stream references
        this.screenStream = null;
        this.webcamStream = null;
        this.micStream = null;

        // Track states
        this.screenActive = false;
        this.webcamActive = false;
        this.micActive = false;

        // DOM elements
        this.screenPreview = null;
        this.webcamPreview = null;
        this.previewPlaceholder = null;
        this.webcamOverlay = null;

        // Callbacks
        this.onStateChange = null;
    }

    /**
     * Initialize media manager with DOM elements
     */
    init() {
        this.screenPreview = document.getElementById('screenPreview');
        this.webcamPreview = document.getElementById('webcamPreview');
        this.previewPlaceholder = document.getElementById('previewPlaceholder');
        this.webcamOverlay = document.getElementById('webcamOverlay');

        console.log('📹 MediaManager initialized');
        return this;
    }

    /**
     * Start screen capture
     */
    async startScreenCapture() {
        try {
            // Request screen capture with audio
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    displaySurface: 'monitor'
                },
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            // Set up the preview
            if (this.screenPreview) {
                this.screenPreview.srcObject = this.screenStream;
                this.screenPreview.classList.remove('hidden');
                // Explicitly play the video (autoplay not reliable for programmatic streams)
                try {
                    await this.screenPreview.play();
                } catch (e) {
                    console.warn('Screen preview autoplay blocked:', e);
                }
            }

            // Hide placeholder
            if (this.previewPlaceholder) {
                this.previewPlaceholder.classList.add('hidden');
            }

            // Handle stream ending (user clicks browser's stop button)
            this.screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                this.stopScreenCapture();
            });

            this.screenActive = true;
            this._notifyStateChange();
            console.log('🖥️ Screen capture started');
            return true;

        } catch (error) {
            if (error.name === 'NotAllowedError') {
                console.log('❌ Screen capture cancelled by user');
            } else {
                console.error('❌ Screen capture error:', error);
            }
            return false;
        }
    }

    /**
     * Stop screen capture
     */
    stopScreenCapture() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        if (this.screenPreview) {
            this.screenPreview.srcObject = null;
            this.screenPreview.classList.add('hidden');
        }

        // Show placeholder if no other sources active
        if (!this.webcamActive) {
            if (this.previewPlaceholder) {
                this.previewPlaceholder.classList.remove('hidden');
            }
        }

        this.screenActive = false;
        this._notifyStateChange();
        console.log('🖥️ Screen capture stopped');
    }

    /**
     * Toggle screen capture
     */
    async toggleScreenCapture() {
        if (this.screenActive) {
            this.stopScreenCapture();
            return false;
        } else {
            return await this.startScreenCapture();
        }
    }

    /**
     * Start webcam capture
     */
    async startWebcam() {
        try {
            this.webcamStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: false // Audio handled separately by mic
            });

            // Set up the preview
            if (this.webcamPreview) {
                this.webcamPreview.srcObject = this.webcamStream;
                // Explicitly play the video (autoplay not reliable for programmatic streams)
                try {
                    await this.webcamPreview.play();
                } catch (e) {
                    console.warn('Webcam preview autoplay blocked:', e);
                }
            }

            // Webcam overlay is now drawn on canvas by compositor
            // (removed separate overlay div logic)

            this.webcamActive = true;
            this._notifyStateChange();
            console.log('📹 Webcam started');
            return true;

        } catch (error) {
            if (error.name === 'NotAllowedError') {
                console.log('❌ Webcam access denied');
            } else if (error.name === 'NotFoundError') {
                console.log('❌ No webcam found');
                alert('No webcam detected. Please connect a webcam and try again.');
            } else {
                console.error('❌ Webcam error:', error);
            }
            return false;
        }
    }

    /**
     * Stop webcam
     */
    stopWebcam() {
        if (this.webcamStream) {
            this.webcamStream.getTracks().forEach(track => track.stop());
            this.webcamStream = null;
        }

        if (this.webcamPreview) {
            this.webcamPreview.srcObject = null;
        }

        // Webcam overlay handled by compositor now

        this.webcamActive = false;
        this._notifyStateChange();
        console.log('📹 Webcam stopped');
    }

    /**
     * Toggle webcam
     */
    async toggleWebcam() {
        if (this.webcamActive) {
            this.stopWebcam();
            return false;
        } else {
            return await this.startWebcam();
        }
    }

    /**
     * Start microphone capture
     */
    async startMicrophone() {
        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            this.micActive = true;
            this._notifyStateChange();
            console.log('🎙️ Microphone started');
            return true;

        } catch (error) {
            if (error.name === 'NotAllowedError') {
                console.log('❌ Microphone access denied');
            } else if (error.name === 'NotFoundError') {
                console.log('❌ No microphone found');
                alert('No microphone detected. Please connect a microphone and try again.');
            } else {
                console.error('❌ Microphone error:', error);
            }
            return false;
        }
    }

    /**
     * Stop microphone
     */
    stopMicrophone() {
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }

        this.micActive = false;
        this._notifyStateChange();
        console.log('🎙️ Microphone stopped');
    }

    /**
     * Toggle microphone
     */
    async toggleMicrophone() {
        if (this.micActive) {
            this.stopMicrophone();
            return false;
        } else {
            return await this.startMicrophone();
        }
    }

    /**
     * Get current state
     */
    getState() {
        return {
            screenActive: this.screenActive,
            webcamActive: this.webcamActive,
            micActive: this.micActive,
            hasAnySource: this.screenActive || this.webcamActive
        };
    }

    /**
     * Stop all streams
     */
    stopAll() {
        this.stopScreenCapture();
        this.stopWebcam();
        this.stopMicrophone();
    }

    /**
     * Notify state change callback
     */
    _notifyStateChange() {
        if (this.onStateChange) {
            this.onStateChange(this.getState());
        }
    }
}

// Create global instance
const mediaManager = new MediaManager();
