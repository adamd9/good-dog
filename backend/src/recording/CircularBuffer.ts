export interface AudioChunk {
  data: Buffer;
  timestamp: Date;
  sampleRate: number;
}

// Single-threaded Node.js - no locking needed
export class CircularBuffer {
  private buffer: AudioChunk[];
  private head: number = 0;
  private _size: number = 0;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(chunk: AudioChunk): void {
    this.buffer[this.head] = chunk;
    this.head = (this.head + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
  }

  get size(): number {
    return this._size;
  }

  // Returns concatenated PCM bytes for the last N seconds
  getLastNSeconds(seconds: number, sampleRate: number): Buffer {
    const bytesNeeded = Math.floor(seconds * sampleRate * 2); // 16-bit = 2 bytes/sample
    const chunks: Buffer[] = [];
    let bytesCollected = 0;

    // Walk backwards from most recent
    for (let i = 0; i < this._size && bytesCollected < bytesNeeded; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      const chunk = this.buffer[idx];
      chunks.unshift(chunk.data);
      bytesCollected += chunk.data.length;
    }

    const combined = Buffer.concat(chunks);
    if (combined.length <= bytesNeeded) return combined;
    return combined.slice(combined.length - bytesNeeded);
  }

  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this._size = 0;
  }
}
