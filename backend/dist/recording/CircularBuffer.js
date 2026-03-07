"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircularBuffer = void 0;
// Single-threaded Node.js - no locking needed
class CircularBuffer {
    constructor(capacity) {
        this.head = 0;
        this._size = 0;
        this.capacity = capacity;
        this.buffer = new Array(capacity);
    }
    push(chunk) {
        this.buffer[this.head] = chunk;
        this.head = (this.head + 1) % this.capacity;
        if (this._size < this.capacity)
            this._size++;
    }
    get size() {
        return this._size;
    }
    // Returns concatenated PCM bytes for the last N seconds
    getLastNSeconds(seconds, sampleRate) {
        const bytesNeeded = Math.floor(seconds * sampleRate * 2); // 16-bit = 2 bytes/sample
        const chunks = [];
        let bytesCollected = 0;
        // Walk backwards from most recent
        for (let i = 0; i < this._size && bytesCollected < bytesNeeded; i++) {
            const idx = (this.head - 1 - i + this.capacity) % this.capacity;
            const chunk = this.buffer[idx];
            chunks.unshift(chunk.data);
            bytesCollected += chunk.data.length;
        }
        const combined = Buffer.concat(chunks);
        if (combined.length <= bytesNeeded)
            return combined;
        return combined.slice(combined.length - bytesNeeded);
    }
    clear() {
        this.buffer = new Array(this.capacity);
        this.head = 0;
        this._size = 0;
    }
}
exports.CircularBuffer = CircularBuffer;
//# sourceMappingURL=CircularBuffer.js.map