/**
 * AudioCapture — abstracts audio input so the rest of the system can work
 * with or without real hardware.
 *
 * Modes:
 *  'stub'       — generates synthetic PCM16 audio (sine wave + white noise)
 *                 without any OS-level audio dependencies.
 *  'microphone' — reads from the system microphone via node-record-lpcm16.
 *                 Requires SoX (`sox`) to be installed on the host.
 *
 * Either way, the class emits:
 *   'data'  (Buffer) — a chunk of raw PCM16 samples
 *   'error' (Error)  — any capture error
 *   'start' ()       — capture has started
 *   'stop'  ()       — capture has stopped
 */
'use strict';

const EventEmitter = require('events');

class AudioCapture extends EventEmitter {
  /**
   * @param {object} options
   * @param {'stub'|'microphone'} [options.mode='stub']
   * @param {number} [options.sampleRate=16000]
   * @param {number} [options.channels=1]
   * @param {number} [options.chunkSize=4096]  samples per emitted chunk
   */
  constructor(options = {}) {
    super();
    this.mode = options.mode || 'stub';
    this.sampleRate = options.sampleRate || 16000;
    this.channels = options.channels || 1;
    this.chunkSize = options.chunkSize || 4096;

    this._recording = false;
    this._stubTimer = null;
    this._micRecorder = null;

    /** Running phase for the synthetic sine-wave generator */
    this._phase = 0;
  }

  /** True while audio capture is active */
  get isRecording() {
    return this._recording;
  }

  /** Start capturing audio */
  start() {
    if (this._recording) return;
    this._recording = true;

    if (this.mode === 'microphone') {
      this._startMicrophone();
    } else {
      this._startStub();
    }

    this.emit('start');
  }

  /** Stop capturing audio */
  stop() {
    if (!this._recording) return;
    this._recording = false;

    if (this._stubTimer) {
      clearInterval(this._stubTimer);
      this._stubTimer = null;
    }

    if (this._micRecorder) {
      try {
        this._micRecorder.stop();
      } catch (_) {
        // ignore errors during teardown
      }
      this._micRecorder = null;
    }

    this.emit('stop');
  }

  // ─── private ─────────────────────────────────────────────────────────────

  /**
   * Stub mode: emits synthetic PCM16 chunks at the correct rate.
   * The signal is a low-level 440 Hz sine + white noise to mimic ambient audio.
   */
  _startStub() {
    const bytesPerSample = 2; // 16-bit
    const chunkBytes = this.chunkSize * bytesPerSample * this.channels;
    const intervalMs = (this.chunkSize / this.sampleRate) * 1000;

    this._stubTimer = setInterval(() => {
      if (!this._recording) return;

      const buf = Buffer.allocUnsafe(chunkBytes);
      for (let i = 0; i < this.chunkSize; i++) {
        // Sine wave at 440 Hz, amplitude ≈ 500 (quiet background)
        const sine = Math.sin(this._phase) * 500;
        // White noise
        const noise = (Math.random() * 2 - 1) * 200;
        const sample = Math.max(-32768, Math.min(32767, Math.round(sine + noise)));
        buf.writeInt16LE(sample, i * bytesPerSample);
        this._phase += (2 * Math.PI * 440) / this.sampleRate;
        if (this._phase > 2 * Math.PI) this._phase -= 2 * Math.PI;
      }
      this.emit('data', buf);
    }, intervalMs);
  }

  /**
   * Microphone mode: uses node-record-lpcm16 (requires SoX on the host).
   * Falls back to stub mode if the package or SoX is unavailable.
   */
  _startMicrophone() {
    let record;
    try {
      record = require('node-record-lpcm16');
    } catch (err) {
      this.emit('error', new Error(`node-record-lpcm16 not installed: ${err.message}. Falling back to stub mode.`));
      this.mode = 'stub';
      this._startStub();
      return;
    }

    try {
      this._micRecorder = record.record({
        sampleRate: this.sampleRate,
        channels: this.channels,
        audioType: 'raw',
        silence: '10.0',
      });

      const stream = this._micRecorder.stream();
      stream.on('data', (chunk) => this.emit('data', chunk));
      stream.on('error', (err) => this.emit('error', err));
    } catch (err) {
      this.emit('error', new Error(`Failed to start microphone: ${err.message}. Falling back to stub mode.`));
      this.mode = 'stub';
      this._micRecorder = null;
      this._startStub();
    }
  }
}

module.exports = AudioCapture;
