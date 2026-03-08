/**
 * barkDetector.js – Spectral analysis-based dog bark detector.
 *
 * Algorithm:
 *   1. Ingest raw 16-bit signed little-endian PCM at sampleRate (default 16 kHz, mono).
 *   2. Segment into overlapping 50 ms frames (25 ms hop).
 *   3. Per frame:
 *        a. Compute RMS energy; update adaptive noise floor.
 *        b. Compute spectral energy in bark-characteristic bands (400–2500 Hz)
 *           using the Goertzel algorithm.
 *        c. Derive a 0–1 probability score from energy × spectral ratio.
 *   4. Track onset/offset of bark events; emit a BarkEvent when an episode ends.
 *
 * Typical dog bark frequencies: 300–2500 Hz (fundamentals + harmonics).
 */

import { EventEmitter } from 'node:events';

const BARK_BANDS = [400, 600, 800, 1000, 1300, 1600, 2000, 2500];
const ALL_BANDS  = [100, 200, 300, 400, 600, 800, 1000, 1300, 1600, 2000, 2500, 3000, 4000, 5000, 6000, 7000];

export class BarkDetector extends EventEmitter {
  /**
   * @param {object} options
   * @param {number} [options.sampleRate=16000]   PCM sample rate (Hz)
   * @param {number} [options.threshold=0.55]     Minimum probability score to begin a bark event
   * @param {number} [options.minDuration=0.15]   Minimum event duration (seconds)
   * @param {number} [options.maxDuration=3.0]    Maximum event duration before forced close
   */
  constructor(options = {}) {
    super();
    this.sampleRate  = options.sampleRate  || 16000;
    this.threshold   = options.threshold   ?? 0.55;
    this.minDuration = options.minDuration ?? 0.15;
    this.maxDuration = options.maxDuration ?? 3.0;

    // Frame / hop size in samples
    this.frameSize = Math.floor(this.sampleRate * 0.05);  // 50 ms
    this.hopSize   = Math.floor(this.sampleRate * 0.025); // 25 ms

    // Adaptive noise floor (updated slowly)
    this.noiseFloor = 0.001;
    this.noiseAlpha = 0.002;

    // Internal PCM accumulation buffer (raw bytes)
    this._buf = Buffer.alloc(0);

    // Bark episode tracking
    this._inBark     = false;
    this._barkStart  = null;
    this._peakScore  = 0;
  }

  /**
   * Feed raw 16-bit signed LE PCM data into the detector.
   * Returns an array of any BarkEvent objects produced.
   * Also emits 'bark' for each completed event and 'score' for each frame score.
   *
   * @param {Buffer} pcmBuffer
   * @returns {BarkEvent[]}
   */
  process(pcmBuffer) {
    this._buf = Buffer.concat([this._buf, pcmBuffer]);
    const events = [];

    while (this._buf.length >= this.frameSize * 2) {
      const frameBytes = this._buf.slice(0, this.frameSize * 2);
      this._buf = this._buf.slice(this.hopSize * 2);

      const score = this._scoreFrame(frameBytes);
      this.emit('score', { score, timestamp: Date.now() });

      const event = this._updateState(score);
      if (event) {
        events.push(event);
        this.emit('bark', event);
      }
    }

    return events;
  }

  /** Reset internal state (useful after a config change). */
  reset() {
    this._buf       = Buffer.alloc(0);
    this._inBark    = false;
    this._barkStart = null;
    this._peakScore = 0;
    this.noiseFloor = 0.001;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _scoreFrame(frameBytes) {
    const N = frameBytes.length / 2;
    const samples = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      samples[i] = frameBytes.readInt16LE(i * 2) / 32768;
    }

    // 1. RMS energy
    let sumSq = 0;
    for (let i = 0; i < N; i++) sumSq += samples[i] * samples[i];
    const rms = Math.sqrt(sumSq / N);

    // 2. Update adaptive noise floor (minimum energy tracker)
    if (rms < this.noiseFloor || this.noiseFloor < 1e-6) {
      this.noiseFloor =
        this.noiseFloor * (1 - this.noiseAlpha) + rms * this.noiseAlpha;
    }

    const floor = Math.max(this.noiseFloor, 1e-5);
    const energyScore = Math.min(1, Math.max(0, (rms - floor * 2) / (floor * 15)));

    if (energyScore < 0.05) return 0; // below noise threshold – skip spectral work

    // 3. Spectral ratio: energy in bark bands vs. all bands
    let barkEnergy = 0;
    let totalEnergy = 0;

    for (const f of BARK_BANDS)  barkEnergy += _goertzel(samples, f, this.sampleRate);
    for (const f of ALL_BANDS)  totalEnergy += _goertzel(samples, f, this.sampleRate);

    const freqScore = totalEnergy > 0 ? barkEnergy / totalEnergy : 0;

    // 4. Combine: weight energy heavily; spectral ratio modifies it
    return energyScore * (0.4 + 0.6 * freqScore);
  }

  _updateState(score) {
    const now = Date.now();

    if (!this._inBark) {
      if (score >= this.threshold) {
        this._inBark    = true;
        this._barkStart = now;
        this._peakScore = score;
      }
      return null;
    }

    // We are inside a potential bark episode
    const durationMs = now - this._barkStart;

    if (score > this._peakScore) {
      this._peakScore = score;
    }

    const ended =
      score < this.threshold * 0.45 ||
      durationMs > this.maxDuration * 1000;

    if (ended) {
      const durationSecs = durationMs / 1000;
      let event = null;

      if (durationSecs >= this.minDuration) {
        event = {
          timestamp:   this._barkStart,
          probability: Math.min(1, this._peakScore),
          duration:    durationSecs,
        };
      }

      this._inBark    = false;
      this._barkStart = null;
      this._peakScore = 0;
      return event;
    }

    return null;
  }
}

/**
 * Goertzel algorithm – computes the power of a single frequency bin.
 * Returns a non-negative energy value (not normalised).
 *
 * @param {Float32Array} samples
 * @param {number} targetFreq  Hz
 * @param {number} sampleRate  Hz
 * @returns {number}
 */
function _goertzel(samples, targetFreq, sampleRate) {
  const N     = samples.length;
  const k     = Math.round(N * targetFreq / sampleRate);
  const omega = (2 * Math.PI * k) / N;
  const coeff = 2 * Math.cos(omega);
  let s0 = 0, s1 = 0, s2 = 0;

  for (let i = 0; i < N; i++) {
    s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }

  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/**
 * @typedef {object} BarkEvent
 * @property {number} timestamp   Unix ms timestamp of bark onset
 * @property {number} probability Detected probability score (0–1)
 * @property {number} duration    Duration of the bark episode in seconds
 */
