/**
 * Video Recorder
 * Records the composite canvas output using MediaRecorder API
 */

class VideoRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.startTime = null;
        this.duration = 0;

        // Recording settings
        this.mimeType = 'video/webm;codecs=vp9';
        this.videoBitsPerSecond = 5000000; // 5 Mbps

        // Callbacks
        this.onRecordingStart = null;
        this.onRecordingStop = null;
        this.onDataAvailable = null;
    }

    /**
     * Check if recording is supported
     */
    isSupported() {
        return MediaRecorder && MediaRecorder.isTypeSupported(this.mimeType);
    }

    /**
     * Get supported MIME type
     */
    getSupportedMimeType() {
        const types = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4'
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return null;
    }

    /**
     * Start recording from a MediaStream
     */
    start(stream, audioStream = null) {
        if (this.isRecording) {
            console.warn('Already recording');
            return false;
        }

        // Get supported MIME type
        this.mimeType = this.getSupportedMimeType();
        if (!this.mimeType) {
            console.error('No supported MIME type found for recording');
            alert('Recording is not supported in this browser');
            return false;
        }

        // Combine video and audio streams if audio is provided
        let combinedStream = stream;
        if (audioStream) {
            const tracks = [
                ...stream.getVideoTracks(),
                ...audioStream.getAudioTracks()
            ];
            combinedStream = new MediaStream(tracks);
        }

        try {
            // Create MediaRecorder
            this.mediaRecorder = new MediaRecorder(combinedStream, {
                mimeType: this.mimeType,
                videoBitsPerSecond: this.videoBitsPerSecond
            });

            this.recordedChunks = [];

            // Handle data available
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                    if (this.onDataAvailable) {
                        this.onDataAvailable(event.data);
                    }
                }
            };

            // Handle recording stop
            this.mediaRecorder.onstop = () => {
                this.isRecording = false;
                this.duration = Date.now() - this.startTime;

                if (this.onRecordingStop) {
                    this.onRecordingStop(this.recordedChunks, this.duration);
                }

                console.log('⏹️ Recording stopped', `Duration: ${Math.round(this.duration / 1000)}s`);
            };

            // Start recording
            this.mediaRecorder.start(1000); // Collect data every second
            this.isRecording = true;
            this.startTime = Date.now();

            if (this.onRecordingStart) {
                this.onRecordingStart();
            }

            console.log('🔴 Recording started', this.mimeType);
            return true;

        } catch (error) {
            console.error('Failed to start recording:', error);
            alert('Failed to start recording: ' + error.message);
            return false;
        }
    }

    /**
     * Stop recording
     */
    stop() {
        if (!this.isRecording || !this.mediaRecorder) {
            console.warn('Not recording');
            return;
        }

        this.mediaRecorder.stop();
    }

    /**
     * Get the recorded blob
     */
    getBlob() {
        if (this.recordedChunks.length === 0) {
            return null;
        }
        return new Blob(this.recordedChunks, { type: this.mimeType });
    }

    /**
     * Download the recording
     */
    download(filename = null) {
        const blob = this.getBlob();
        if (!blob) {
            console.warn('No recording to download');
            return;
        }

        // Generate filename with timestamp
        if (!filename) {
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            filename = `recording-${timestamp}.webm`;
        }

        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Cleanup
        setTimeout(() => URL.revokeObjectURL(url), 100);

        console.log('💾 Recording downloaded:', filename);
    }

    /**
     * Download as specific format (converts via server)
     */
    async downloadAsFormat(format = 'mp4') {
        const blob = this.getBlob();
        if (!blob) {
            console.warn('No recording to download');
            return false;
        }

        console.log(`🔄 Converting to ${format.toUpperCase()}...`);

        try {
            // Create form data
            const formData = new FormData();
            formData.append('video', blob, 'recording.webm');
            formData.append('format', format);

            // Upload and convert
            const response = await fetch('/api/convert', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Conversion failed');
            }

            // Download the converted file
            const convertedBlob = await response.blob();
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `recording-${timestamp}.${format}`;

            const url = URL.createObjectURL(convertedBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            setTimeout(() => URL.revokeObjectURL(url), 100);

            console.log(`💾 Recording downloaded as ${format.toUpperCase()}:`, filename);
            return true;

        } catch (error) {
            console.error('Conversion error:', error);
            alert(`Failed to convert: ${error.message}\n\nDownloading as WebM instead.`);
            this.download();
            return false;
        }
    }

    /**
     * Get recording duration in seconds
     */
    getDuration() {
        if (this.isRecording) {
            return Math.round((Date.now() - this.startTime) / 1000);
        }
        return Math.round(this.duration / 1000);
    }

    /**
     * Format duration as MM:SS
     */
    getFormattedDuration() {
        const seconds = this.getDuration();
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Check if there's a recording available
     */
    hasRecording() {
        return this.recordedChunks.length > 0;
    }

    /**
     * Upload recording to YouTube
     */
    async uploadToYouTube(title, description = '', privacy = 'private', tags = '') {
        const blob = this.getBlob();
        if (!blob) {
            console.warn('No recording to upload');
            return { success: false, error: 'No recording available' };
        }

        console.log(`📤 Uploading to YouTube: ${title}`);

        try {
            // Create form data
            const formData = new FormData();
            formData.append('video', blob, 'recording.webm');
            formData.append('title', title);
            formData.append('description', description);
            formData.append('privacy', privacy);
            formData.append('tags', tags);

            // Upload to YouTube via our API
            const response = await fetch('/api/youtube/upload', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || result.error || 'Upload failed');
            }

            console.log(`✅ YouTube upload complete: ${result.videoUrl}`);
            return {
                success: true,
                videoId: result.videoId,
                videoUrl: result.videoUrl,
                title: result.title
            };

        } catch (error) {
            console.error('YouTube upload error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Create global instance
const videoRecorder = new VideoRecorder();

