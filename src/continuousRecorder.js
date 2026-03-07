/**
 * ContinuousRecorder — captures the raw PCM stream from an AudioCapture
 * instance and periodically flushes it to dated WAV files.
 *
 * The default block size is 12 hours (configurable). Each block is saved as:
 *   <recordingsDir>/YYYY-MM-DD_HH-mm-ss.wav
 *
 * A ring buffer holds recent audio in memory so AudioSlicer can cut clips
 * from the last N seconds without waiting for a file flush.
 *
 * Events emitted:
 *   'file-saved' ({ path, startTime, endTime }) — when a block file is written
 *   'error'      (Error)
 */
'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const WaveFile = require('wavefile').WaveFile;

class ContinuousRecorder extends EventEmitter {
  /**
   * @param {object} options
   * @param {string}  options.recordingsDir
   * @param {number}  [options.sampleRate=16000]
   * @param {number}  [options.channels=1]
   * @param {number}  [options.bitDepth=16]
   * @param {number}  [options.blockSeconds=43200]   Block duration (default 12 h)
   * @param {number}  [options.ringBufferSeconds=30] In-memory ring buffer length
   */
  constructor(options = {}) {
    super();
    this.recordingsDir = options.recordingsDir;
    this.sampleRate = options.sampleRate || 16000;
    this.channels = options.channels || 1;
    this.bitDepth = options.bitDepth || 16;
    this.blockSeconds = options.blockSeconds || 12 * 60 * 60;
    this.ringBufferSeconds = options.ringBufferSeconds || 30;

    this._active = false;
    this._capture = null;
    this._blockBuffer = [];      // audio data for current file block
    this._ringBuffer = [];       // recent audio for live clip extraction
    this._blockStartTime = null; // Date when current block started
    this._blockFlushTimer = null;
  }

  /** @returns {boolean} */
  get isRecording() {
    return this._active;
  }

  /**
   * Attach an AudioCapture instance and start recording.
   * @param {import('./audioCapture')} audioCapture
   */
  start(audioCapture) {
    if (this._active) return;
    this._active = true;
    this._capture = audioCapture;
    this._blockStartTime = new Date();
    this._blockBuffer = [];
    this._ringBuffer = [];

    audioCapture.on('data', this._onData.bind(this));
    audioCapture.on('error', (err) => this.emit('error', err));

    // Schedule block flush
    this._scheduleFlush();

    if (!audioCapture.isRecording) {
      audioCapture.start();
    }
  }

  /** Stop recording and flush any remaining buffered audio to disk. */
  async stop() {
    if (!this._active) return;
    this._active = false;

    if (this._blockFlushTimer) {
      clearTimeout(this._blockFlushTimer);
      this._blockFlushTimer = null;
    }

    if (this._capture) {
      this._capture.removeAllListeners('data');
      this._capture = null;
    }

    await this._flushBlock();
  }

  /**
   * Returns a copy of the in-memory ring buffer as a single Buffer.
   * Useful for slicing recent audio without reading from disk.
   * @returns {Buffer}
   */
  getRingBuffer() {
    return Buffer.concat(this._ringBuffer);
  }

  /**
   * Returns a list of saved recording files, sorted by filename (chronological).
   * @returns {Array<{path: string, filename: string}>}
   */
  listRecordings() {
    if (!fs.existsSync(this.recordingsDir)) return [];
    return fs
      .readdirSync(this.recordingsDir)
      .filter((f) => f.endsWith('.wav'))
      .sort()
      .map((f) => ({ filename: f, path: path.join(this.recordingsDir, f) }));
  }

  // ─── private ─────────────────────────────────────────────────────────────

  _onData(chunk) {
    if (!this._active) return;
    this._blockBuffer.push(chunk);

    // Maintain the ring buffer (drop old chunks)
    this._ringBuffer.push(chunk);
    const maxBytes = this.ringBufferSeconds * this.sampleRate * this.channels * (this.bitDepth / 8);
    let total = this._ringBuffer.reduce((s, b) => s + b.length, 0);
    while (total > maxBytes && this._ringBuffer.length > 0) {
      total -= this._ringBuffer[0].length;
      this._ringBuffer.shift();
    }
  }

  _scheduleFlush() {
    const ms = this.blockSeconds * 1000;
    this._blockFlushTimer = setTimeout(async () => {
      if (!this._active) return;
      await this._flushBlock();
      this._blockStartTime = new Date();
      this._blockBuffer = [];
      this._scheduleFlush();
    }, ms);
  }

  async _flushBlock() {
    if (this._blockBuffer.length === 0) return;

    const combined = Buffer.concat(this._blockBuffer);
    const int16 = new Int16Array(combined.buffer, combined.byteOffset, combined.byteLength / 2);

    const wav = new WaveFile();
    wav.fromScratch(this.channels, this.sampleRate, '16', Array.from(int16));

    const ts = this._blockStartTime || new Date();
    const filename = this._formatTimestamp(ts) + '.wav';

    fs.mkdirSync(this.recordingsDir, { recursive: true });
    const filePath = path.join(this.recordingsDir, filename);
    fs.writeFileSync(filePath, wav.toBuffer());

    const endTime = new Date();
    this.emit('file-saved', { path: filePath, startTime: ts, endTime });
  }

  _formatTimestamp(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
    );
  }
}

module.exports = ContinuousRecorder;
