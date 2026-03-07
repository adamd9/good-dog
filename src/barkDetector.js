/**
 * BarkDetector — analyses audio buffers and returns a bark probability (0–1).
 *
 * Two modes are supported:
 *   'stub'      — random probability for development / testing.
 *   'frequency' — lightweight RMS + band-energy analysis that does not
 *                 require an ML runtime. Works well as a baseline detector
 *                 and can be replaced with a full TensorFlow.js / YAMNet
 *                 model without changing the caller interface.
 */
'use strict';

/** Maximum absolute value of a 16-bit signed integer sample. */
const INT16_MAX = 32768;

class BarkDetector {
  /**
   * @param {object} options
   * @param {'stub'|'frequency'} [options.mode='stub']
   * @param {number} [options.sampleRate=16000]
   * @param {number} [options.threshold=0.7]  - minimum probability to count as a bark
   * @param {number} [options.stubEventProbability=0.02]
   */
  constructor(options = {}) {
    this.mode = options.mode || 'stub';
    this.sampleRate = options.sampleRate || 16000;
    this.threshold = options.threshold || 0.7;
    this.stubEventProbability = options.stubEventProbability || 0.02;
  }

  /**
   * Analyse a PCM16 audio buffer and return a probability value (0–1).
   *
   * @param {Buffer|Int16Array} audioBuffer  Raw PCM16 samples.
   * @returns {number} probability  0 = definitely no bark, 1 = definitely bark.
   */
  analyze(audioBuffer) {
    if (this.mode === 'stub') {
      return this._stubAnalyze();
    }
    return this._frequencyAnalyze(audioBuffer);
  }

  /**
   * Returns true when the given probability meets the configured threshold.
   * @param {number} probability
   * @returns {boolean}
   */
  isBark(probability) {
    return probability >= this.threshold;
  }

  // ─── private ─────────────────────────────────────────────────────────────

  /**
   * Stub analyser: simulates sparse bark events with configurable probability.
   * Useful during development and for UI demos without real audio hardware.
   */
  _stubAnalyze() {
    if (Math.random() < this.stubEventProbability) {
      // Bark event — generate a high probability value
      return 0.7 + Math.random() * 0.3;
    }
    // Background noise — generate a low probability value
    return Math.random() * 0.4;
  }

  /**
   * Frequency-analysis detector.
   *
   * Dog barks sit primarily in the 300 – 3 000 Hz range and have high RMS
   * energy compared to ambient noise. This function:
   *  1. Computes RMS energy of the whole buffer.
   *  2. Uses a simple DFT to estimate energy in the bark frequency band.
   *  3. Combines both measures into a 0–1 probability score.
   *
   * @param {Buffer|Int16Array} audioBuffer  Raw PCM16 samples.
   * @returns {number}
   */
  _frequencyAnalyze(audioBuffer) {
    const samples = this._toFloat32(audioBuffer);
    if (samples.length === 0) return 0;

    const rms = this._rms(samples);

    // Normalise RMS: a full-scale signal has RMS ≈ 0.707
    const normalizedRms = Math.min(rms / 0.707, 1);

    // Low RMS means silence — short-circuit early
    if (normalizedRms < 0.01) return 0;

    const bandEnergy = this._bandEnergy(samples, 300, 3000, this.sampleRate);

    // Weight: 40 % RMS + 60 % band energy in the bark range
    const probability = 0.4 * normalizedRms + 0.6 * bandEnergy;
    return Math.min(probability, 1);
  }

  /**
   * Convert a PCM16 Buffer or Int16Array to normalised Float32Array (-1..1).
   */
  _toFloat32(audioBuffer) {
    let int16;
    if (audioBuffer instanceof Int16Array) {
      int16 = audioBuffer;
    } else if (Buffer.isBuffer(audioBuffer)) {
      int16 = new Int16Array(
        audioBuffer.buffer,
        audioBuffer.byteOffset,
        audioBuffer.byteLength / 2,
      );
    } else {
      return new Float32Array(0);
    }

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / INT16_MAX;
    }
    return float32;
  }

  /**
   * Root-mean-square energy of a float sample array.
   */
  _rms(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  /**
   * Estimate energy fraction in [lowHz, highHz] using a simplified DFT.
   * Only evaluates a sparse set of frequency bins to keep CPU cost low.
   *
   * @param {Float32Array} samples
   * @param {number} lowHz
   * @param {number} highHz
   * @param {number} sampleRate
   * @returns {number}  fraction 0–1
   */
  _bandEnergy(samples, lowHz, highHz, sampleRate) {
    const n = samples.length;
    const nyquist = sampleRate / 2;

    // Evaluate at most 32 frequency bins for performance
    const steps = Math.min(32, Math.floor(n / 2));
    const binWidth = nyquist / steps;

    let bandPower = 0;
    let totalPower = 0;

    for (let k = 1; k <= steps; k++) {
      const freq = k * binWidth;
      const angle = (2 * Math.PI * k) / n;

      let re = 0;
      let im = 0;
      for (let t = 0; t < n; t++) {
        re += samples[t] * Math.cos(angle * t);
        im += samples[t] * Math.sin(angle * t);
      }
      const power = re * re + im * im;

      totalPower += power;
      if (freq >= lowHz && freq <= highHz) {
        bandPower += power;
      }
    }

    if (totalPower === 0) return 0;
    return bandPower / totalPower;
  }
}

module.exports = BarkDetector;
