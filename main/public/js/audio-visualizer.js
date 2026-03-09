/**
 * Audio Visualizer
 * Displays real-time audio levels for mic and system audio
 */

class AudioVisualizer {
    constructor() {
        this.audioContext = null;
        this.micAnalyser = null;
        this.systemAnalyser = null;
        this.micDataArray = null;
        this.systemDataArray = null;
        this.animationId = null;
        this.isActive = false;

        // UI elements
        this.micBar = null;
        this.systemBar = null;
        this.micLevel = null;
        this.systemLevel = null;
    }

    /**
     * Initialize with container element
     */
    init(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('AudioVisualizer: Container not found');
            return this;
        }

        // Create visualizer HTML
        container.innerHTML = `
            <div class="audio-visualizer">
                <div class="audio-channel">
                    <span class="channel-label">🎙️ Mic</span>
                    <div class="level-bar-container">
                        <div class="level-bar mic-bar" id="micLevelBar"></div>
                    </div>
                    <span class="level-value" id="micLevelValue">-∞ dB</span>
                </div>
                <div class="audio-channel">
                    <span class="channel-label">🔊 Sys</span>
                    <div class="level-bar-container">
                        <div class="level-bar system-bar" id="systemLevelBar"></div>
                    </div>
                    <span class="level-value" id="systemLevelValue">-∞ dB</span>
                </div>
            </div>
        `;

        this.micBar = document.getElementById('micLevelBar');
        this.systemBar = document.getElementById('systemLevelBar');
        this.micLevel = document.getElementById('micLevelValue');
        this.systemLevel = document.getElementById('systemLevelValue');

        console.log('📊 AudioVisualizer initialized');
        return this;
    }

    /**
     * Connect microphone stream for visualization
     */
    connectMicStream(stream) {
        if (!stream) return;

        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Create analyser for mic
            this.micAnalyser = this.audioContext.createAnalyser();
            this.micAnalyser.fftSize = 256;
            this.micDataArray = new Uint8Array(this.micAnalyser.frequencyBinCount);

            // Connect stream to analyser
            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.micAnalyser);

            console.log('🎙️ Mic connected to visualizer');
            this._startVisualization();
        } catch (e) {
            console.error('Error connecting mic to visualizer:', e);
        }
    }

    /**
     * Disconnect microphone
     */
    disconnectMic() {
        this.micAnalyser = null;
        this.micDataArray = null;
        if (this.micBar) this.micBar.style.width = '0%';
        if (this.micLevel) this.micLevel.textContent = '-∞ dB';
    }

    /**
     * Connect system audio stream for visualization
     */
    connectSystemStream(stream) {
        if (!stream) return;

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            console.log('⚠️ No audio tracks in system stream');
            return;
        }

        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Create analyser for system audio
            this.systemAnalyser = this.audioContext.createAnalyser();
            this.systemAnalyser.fftSize = 256;
            this.systemDataArray = new Uint8Array(this.systemAnalyser.frequencyBinCount);

            // Connect stream to analyser
            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.systemAnalyser);

            console.log('🔊 System audio connected to visualizer');
            this._startVisualization();
        } catch (e) {
            console.error('Error connecting system audio to visualizer:', e);
        }
    }

    /**
     * Disconnect system audio
     */
    disconnectSystem() {
        this.systemAnalyser = null;
        this.systemDataArray = null;
        if (this.systemBar) this.systemBar.style.width = '0%';
        if (this.systemLevel) this.systemLevel.textContent = '-∞ dB';
    }

    /**
     * Start the visualization loop
     */
    _startVisualization() {
        if (this.isActive) return;
        this.isActive = true;
        this._visualize();
    }

    /**
     * Visualization render loop
     */
    _visualize() {
        if (!this.isActive) return;

        // Update mic level
        if (this.micAnalyser && this.micDataArray) {
            this.micAnalyser.getByteFrequencyData(this.micDataArray);
            const micAvg = this._getAverageVolume(this.micDataArray);
            const micPercent = Math.min(100, (micAvg / 128) * 100);
            const micDb = this._volumeToDb(micAvg);

            if (this.micBar) this.micBar.style.width = micPercent + '%';
            if (this.micLevel) this.micLevel.textContent = micDb;

            // Color based on level
            if (this.micBar) {
                if (micPercent > 80) {
                    this.micBar.style.background = 'var(--color-error)';
                } else if (micPercent > 50) {
                    this.micBar.style.background = 'var(--color-warning)';
                } else {
                    this.micBar.style.background = 'var(--color-success)';
                }
            }
        }

        // Update system audio level
        if (this.systemAnalyser && this.systemDataArray) {
            this.systemAnalyser.getByteFrequencyData(this.systemDataArray);
            const sysAvg = this._getAverageVolume(this.systemDataArray);
            const sysPercent = Math.min(100, (sysAvg / 128) * 100);
            const sysDb = this._volumeToDb(sysAvg);

            if (this.systemBar) this.systemBar.style.width = sysPercent + '%';
            if (this.systemLevel) this.systemLevel.textContent = sysDb;

            // Color based on level
            if (this.systemBar) {
                if (sysPercent > 80) {
                    this.systemBar.style.background = 'var(--color-error)';
                } else if (sysPercent > 50) {
                    this.systemBar.style.background = 'var(--color-warning)';
                } else {
                    this.systemBar.style.background = 'var(--color-accent-primary)';
                }
            }
        }

        this.animationId = requestAnimationFrame(() => this._visualize());
    }

    /**
     * Calculate average volume from frequency data
     */
    _getAverageVolume(dataArray) {
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        return sum / dataArray.length;
    }

    /**
     * Convert volume (0-255) to dB display
     */
    _volumeToDb(volume) {
        if (volume < 1) return '-∞ dB';
        const db = 20 * Math.log10(volume / 128);
        return db.toFixed(0) + ' dB';
    }

    /**
     * Stop visualization
     */
    stop() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * Resume audio context
     */
    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }
}

// Create global instance
const audioVisualizer = new AudioVisualizer();
