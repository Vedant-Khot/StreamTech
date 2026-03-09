/**
 * Webcam Overlay Controller
 * Handles drag-to-reposition and resize controls for webcam overlay
 */

class WebcamController {
    constructor(compositor) {
        this.compositor = compositor;
        this.canvas = null;
        this.isDragging = false;
        this.isResizing = false;
        this.dragStart = { x: 0, y: 0 };
        this.initialPos = { x: 0, y: 0 };

        // UI state
        this.showControls = false;
        this.hoverWebcam = false;

        // Resize handle size
        this.handleSize = 12;

        // Size presets
        this.sizePresets = [
            { name: 'Small', width: 240, height: 135 },
            { name: 'Medium', width: 320, height: 180 },
            { name: 'Large', width: 480, height: 270 }
        ];
        this.currentPreset = 1; // Medium
    }

    /**
     * Initialize controller with canvas
     */
    init(canvasElement) {
        this.canvas = canvasElement;
        this._setupEventListeners();
        console.log('🎮 WebcamController initialized');
        return this;
    }

    /**
     * Set up mouse/touch event listeners
     */
    _setupEventListeners() {
        const canvas = this.canvas;

        // Mouse events
        canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
        canvas.addEventListener('mouseleave', (e) => this._onMouseUp(e));

        // Touch events for mobile
        canvas.addEventListener('touchstart', (e) => this._onTouchStart(e));
        canvas.addEventListener('touchmove', (e) => this._onTouchMove(e));
        canvas.addEventListener('touchend', (e) => this._onTouchEnd(e));

        // Double-click to cycle size
        canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));
    }

    /**
     * Get mouse position relative to canvas (accounting for scale)
     */
    _getCanvasPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.compositor.width / rect.width;
        const scaleY = this.compositor.height / rect.height;

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    /**
     * Check if point is inside webcam overlay
     */
    _isInsideWebcam(pos) {
        const wc = this.compositor.webcamPosition;
        return pos.x >= wc.x && pos.x <= wc.x + wc.width &&
            pos.y >= wc.y && pos.y <= wc.y + wc.height;
    }

    /**
     * Check if point is on resize handle
     */
    _isOnResizeHandle(pos) {
        const wc = this.compositor.webcamPosition;
        const handleX = wc.x + wc.width - this.handleSize;
        const handleY = wc.y + wc.height - this.handleSize;

        return pos.x >= handleX && pos.x <= wc.x + wc.width &&
            pos.y >= handleY && pos.y <= wc.y + wc.height;
    }

    /**
     * Mouse down handler
     */
    _onMouseDown(e) {
        if (!this.compositor.webcamVideo) return;

        const pos = this._getCanvasPos(e);

        if (this._isOnResizeHandle(pos)) {
            this.isResizing = true;
            this.isDragging = false;
        } else if (this._isInsideWebcam(pos)) {
            this.isDragging = true;
            this.isResizing = false;
            this.dragStart = pos;
            this.initialPos = {
                x: this.compositor.webcamPosition.x,
                y: this.compositor.webcamPosition.y
            };
        }

        if (this.isDragging || this.isResizing) {
            this.canvas.style.cursor = this.isResizing ? 'nwse-resize' : 'grabbing';
            e.preventDefault();
        }
    }

    /**
     * Mouse move handler
     */
    _onMouseMove(e) {
        if (!this.compositor.webcamVideo) return;

        const pos = this._getCanvasPos(e);

        if (this.isDragging) {
            // Calculate new position
            const dx = pos.x - this.dragStart.x;
            const dy = pos.y - this.dragStart.y;

            let newX = this.initialPos.x + dx;
            let newY = this.initialPos.y + dy;

            // Constrain to canvas bounds
            const wc = this.compositor.webcamPosition;
            newX = Math.max(0, Math.min(this.compositor.width - wc.width, newX));
            newY = Math.max(0, Math.min(this.compositor.height - wc.height, newY));

            this.compositor.webcamPosition.x = newX;
            this.compositor.webcamPosition.y = newY;

        } else if (this.isResizing) {
            // Calculate new size
            const wc = this.compositor.webcamPosition;
            let newWidth = pos.x - wc.x;
            let newHeight = pos.y - wc.y;

            // Maintain 16:9 aspect ratio
            const aspectRatio = 16 / 9;
            newHeight = newWidth / aspectRatio;

            // Constrain size
            newWidth = Math.max(160, Math.min(640, newWidth));
            newHeight = newWidth / aspectRatio;

            // Ensure it stays in bounds
            if (wc.x + newWidth > this.compositor.width) {
                newWidth = this.compositor.width - wc.x;
                newHeight = newWidth / aspectRatio;
            }
            if (wc.y + newHeight > this.compositor.height) {
                newHeight = this.compositor.height - wc.y;
                newWidth = newHeight * aspectRatio;
            }

            this.compositor.webcamPosition.width = newWidth;
            this.compositor.webcamPosition.height = newHeight;

        } else {
            // Update cursor based on hover state
            if (this._isOnResizeHandle(pos)) {
                this.canvas.style.cursor = 'nwse-resize';
                this.hoverWebcam = true;
            } else if (this._isInsideWebcam(pos)) {
                this.canvas.style.cursor = 'grab';
                this.hoverWebcam = true;
            } else {
                this.canvas.style.cursor = 'default';
                this.hoverWebcam = false;
            }
        }
    }

    /**
     * Mouse up handler
     */
    _onMouseUp(e) {
        this.isDragging = false;
        this.isResizing = false;
        this.canvas.style.cursor = 'default';
    }

    /**
     * Touch start handler
     */
    _onTouchStart(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this._onMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
        }
    }

    /**
     * Touch move handler
     */
    _onTouchMove(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this._onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
            e.preventDefault();
        }
    }

    /**
     * Touch end handler
     */
    _onTouchEnd(e) {
        this._onMouseUp(e);
    }

    /**
     * Double-click to cycle through size presets
     */
    _onDoubleClick(e) {
        if (!this.compositor.webcamVideo) return;

        const pos = this._getCanvasPos(e);

        if (this._isInsideWebcam(pos)) {
            // Cycle to next preset
            this.currentPreset = (this.currentPreset + 1) % this.sizePresets.length;
            const preset = this.sizePresets[this.currentPreset];

            // Update size
            this.compositor.webcamPosition.width = preset.width;
            this.compositor.webcamPosition.height = preset.height;

            // Keep in bounds
            const wc = this.compositor.webcamPosition;
            if (wc.x + wc.width > this.compositor.width) {
                wc.x = this.compositor.width - wc.width;
            }
            if (wc.y + wc.height > this.compositor.height) {
                wc.y = this.compositor.height - wc.height;
            }

            console.log(`📹 Webcam size: ${preset.name} (${preset.width}x${preset.height})`);
        }
    }

    /**
     * Set webcam to a corner position
     */
    setCorner(corner) {
        const wc = this.compositor.webcamPosition;
        const margin = wc.margin;

        switch (corner) {
            case 'top-left':
                wc.x = margin;
                wc.y = margin;
                break;
            case 'top-right':
                wc.x = this.compositor.width - wc.width - margin;
                wc.y = margin;
                break;
            case 'bottom-left':
                wc.x = margin;
                wc.y = this.compositor.height - wc.height - margin;
                break;
            case 'bottom-right':
            default:
                wc.x = this.compositor.width - wc.width - margin;
                wc.y = this.compositor.height - wc.height - margin;
                break;
        }

        console.log(`📹 Webcam position: ${corner}`);
    }

    /**
     * Set webcam size by preset name
     */
    setSize(sizeName) {
        const preset = this.sizePresets.find(p => p.name.toLowerCase() === sizeName.toLowerCase());
        if (preset) {
            this.compositor.webcamPosition.width = preset.width;
            this.compositor.webcamPosition.height = preset.height;
            this.currentPreset = this.sizePresets.indexOf(preset);
            console.log(`📹 Webcam size: ${preset.name}`);
        }
    }
}

// Create global instance
const webcamController = new WebcamController(videoCompositor);
