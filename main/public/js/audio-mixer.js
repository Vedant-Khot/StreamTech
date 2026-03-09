/**
 * Audio Mixer
 * Combines microphone and system audio using Web Audio API
 */

class AudioMixer {
    constructor() {
        this.audioContext = null;
        this.destination = null;
        this.micSource = null;
        this.systemSource = null;
        this.micGain = null;
        this.systemGain = null;
        this.mixedStream = null;

        // Volume levels (0-1)
        this.micVolume = 1.0;
        this.systemVolume = 1.0;

        // State
        this.isInitialized = false;
    }

    /**
     * Initialize the audio context
     */
    init() {
        if (this.isInitialized) return this;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.destination = this.audioContext.createMediaStreamDestination();
            this.isInitialized = true;
            console.log('🔊 AudioMixer initialized');
        } catch (e) {
            console.error('AudioMixer init error:', e);
        }

        return this;
    }

    /**
     * Add microphone stream to the mix
     */
    addMicrophoneStream(stream) {
        if (!this.isInitialized) this.init();
        if (!stream) return;

        try {
            // Disconnect previous mic source
            if (this.micSource) {
                this.micSource.disconnect();
            }

            // Create source from mic stream
            this.micSource = this.audioContext.createMediaStreamSource(stream);

            // Create gain node for volume control
            this.micGain = this.audioContext.createGain();
            this.micGain.gain.value = this.micVolume;

            // Connect: mic -> gain -> destination
            this.micSource.connect(this.micGain);
            this.micGain.connect(this.destination);

            console.log('🎙️ Microphone added to mix');
            this._updateMixedStream();
        } catch (e) {
            console.error('Error adding mic:', e);
        }
    }

    /**
     * Remove microphone from mix
     */
    removeMicrophoneStream() {
        if (this.micSource) {
            this.micSource.disconnect();
            this.micSource = null;
        }
        if (this.micGain) {
            this.micGain.disconnect();
            this.micGain = null;
        }
        console.log('🎙️ Microphone removed from mix');
        this._updateMixedStream();
    }

    /**
     * Add system audio stream to the mix (from screen share)
     */
    addSystemAudioStream(stream) {
        if (!this.isInitialized) this.init();
        if (!stream) return;

        // Get audio tracks from the stream
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            console.log('⚠️ No audio tracks in screen share');
            return;
        }

        try {
            // Disconnect previous system source
            if (this.systemSource) {
                this.systemSource.disconnect();
            }

            // Create source from system audio
            this.systemSource = this.audioContext.createMediaStreamSource(stream);

            // Create gain node for volume control
            this.systemGain = this.audioContext.createGain();
            this.systemGain.gain.value = this.systemVolume;

            // Connect: system -> gain -> destination
            this.systemSource.connect(this.systemGain);
            this.systemGain.connect(this.destination);

            console.log('🔊 System audio added to mix');
            this._updateMixedStream();
        } catch (e) {
            console.error('Error adding system audio:', e);
        }
    }

    /**
     * Remove system audio from mix
     */
    removeSystemAudioStream() {
        if (this.systemSource) {
            this.systemSource.disconnect();
            this.systemSource = null;
        }
        if (this.systemGain) {
            this.systemGain.disconnect();
            this.systemGain = null;
        }
        console.log('🔊 System audio removed from mix');
        this._updateMixedStream();
    }

    /**
     * Set microphone volume (0-1)
     */
    setMicVolume(volume) {
        this.micVolume = Math.max(0, Math.min(1, volume));
        if (this.micGain) {
            this.micGain.gain.value = this.micVolume;
        }
    }

    /**
     * Set system audio volume (0-1)
     */
    setSystemVolume(volume) {
        this.systemVolume = Math.max(0, Math.min(1, volume));
        if (this.systemGain) {
            this.systemGain.gain.value = this.systemVolume;
        }
    }

    /**
     * Update the mixed output stream
     */
    _updateMixedStream() {
        if (this.destination) {
            this.mixedStream = this.destination.stream;
        }
    }

    /**
     * Get the mixed audio stream
     */
    getMixedStream() {
        if (!this.isInitialized) return null;
        return this.destination?.stream || null;
    }

    /**
     * Check if any audio sources are active
     */
    hasAudioSources() {
        return !!(this.micSource || this.systemSource);
    }

    /**
     * Stop all audio and cleanup
     */
    stop() {
        this.removeMicrophoneStream();
        this.removeSystemAudioStream();

        if (this.audioContext && this.audioContext.state !== 'closed') {
            // Don't close the context, just disconnect
            // this.audioContext.close();
        }

        console.log('🔇 AudioMixer stopped');
    }

    /**
     * Resume audio context (needed after user interaction)
     */
    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
            console.log('🔊 AudioContext resumed');
        }
    }
}

// Create global instance
const audioMixer = new AudioMixer();
