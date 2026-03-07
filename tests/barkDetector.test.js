'use strict';

const BarkDetector = require('../src/barkDetector');

describe('BarkDetector', () => {
  describe('constructor', () => {
    it('uses sensible defaults', () => {
      const d = new BarkDetector();
      expect(d.mode).toBe('stub');
      expect(d.sampleRate).toBe(16000);
      expect(d.threshold).toBe(0.7);
      expect(d.stubEventProbability).toBe(0.02);
    });

    it('accepts custom options', () => {
      const d = new BarkDetector({ mode: 'frequency', sampleRate: 44100, threshold: 0.5 });
      expect(d.mode).toBe('frequency');
      expect(d.sampleRate).toBe(44100);
      expect(d.threshold).toBe(0.5);
    });
  });

  describe('isBark()', () => {
    it('returns true when probability >= threshold', () => {
      const d = new BarkDetector({ threshold: 0.7 });
      expect(d.isBark(0.7)).toBe(true);
      expect(d.isBark(0.9)).toBe(true);
    });

    it('returns false when probability < threshold', () => {
      const d = new BarkDetector({ threshold: 0.7 });
      expect(d.isBark(0.6)).toBe(false);
      expect(d.isBark(0.0)).toBe(false);
    });
  });

  describe('analyze() — stub mode', () => {
    it('returns a number between 0 and 1', () => {
      const d = new BarkDetector({ mode: 'stub' });
      for (let i = 0; i < 20; i++) {
        const p = d.analyze(Buffer.alloc(256));
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    });

    it('generates high-probability events when stubEventProbability is 1', () => {
      // With stubEventProbability = 1, every call should be a "bark"
      const d = new BarkDetector({ mode: 'stub', stubEventProbability: 1 });
      const p = d.analyze(Buffer.alloc(256));
      expect(p).toBeGreaterThanOrEqual(0.7);
    });

    it('generates low-probability events when stubEventProbability is 0', () => {
      // With stubEventProbability = 0, every call should be background
      const d = new BarkDetector({ mode: 'stub', stubEventProbability: 0 });
      const p = d.analyze(Buffer.alloc(256));
      expect(p).toBeLessThan(0.7);
    });
  });

  describe('analyze() — frequency mode', () => {
    it('returns 0 for a silent buffer', () => {
      const d = new BarkDetector({ mode: 'frequency' });
      const silentBuf = Buffer.alloc(4096 * 2); // all zeros → silence
      const p = d.analyze(silentBuf);
      expect(p).toBe(0);
    });

    it('returns a number between 0 and 1 for a noisy buffer', () => {
      const d = new BarkDetector({ mode: 'frequency' });
      const buf = Buffer.allocUnsafe(4096 * 2);
      for (let i = 0; i < 4096; i++) {
        // High-amplitude white noise
        const sample = Math.floor((Math.random() * 2 - 1) * 32767);
        buf.writeInt16LE(sample, i * 2);
      }
      const p = d.analyze(buf);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });

    it('returns a number between 0 and 1 for an Int16Array', () => {
      const d = new BarkDetector({ mode: 'frequency' });
      const arr = new Int16Array(1024);
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 32767);
      const p = d.analyze(arr);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });

    it('returns 0 for an empty buffer', () => {
      const d = new BarkDetector({ mode: 'frequency' });
      const p = d.analyze(Buffer.alloc(0));
      expect(p).toBe(0);
    });

    it('handles unknown input gracefully', () => {
      const d = new BarkDetector({ mode: 'frequency' });
      const p = d.analyze(null);
      expect(p).toBe(0);
    });
  });

  describe('_rms()', () => {
    it('returns 0 for an all-zero array', () => {
      const d = new BarkDetector();
      expect(d._rms(new Float32Array(100))).toBe(0);
    });

    it('returns correct RMS for a constant signal', () => {
      const d = new BarkDetector();
      const samples = new Float32Array(100).fill(0.5);
      expect(d._rms(samples)).toBeCloseTo(0.5, 5);
    });
  });
});
