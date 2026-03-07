'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const WaveFile = require('wavefile').WaveFile;

const AudioSlicer = require('../src/audioSlicer');

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'good-dog-slicer-'));
}

/**
 * Write a minimal WAV file containing `durationSeconds` of silence.
 */
function writeSilentWav(filePath, durationSeconds, sampleRate = 16000, channels = 1) {
  const numSamples = durationSeconds * sampleRate * channels;
  const samples = new Array(numSamples).fill(0);
  const wav = new WaveFile();
  wav.fromScratch(channels, sampleRate, '16', samples);
  fs.writeFileSync(filePath, wav.toBuffer());
}

/**
 * Build an in-memory raw PCM16 Buffer of silence.
 */
function silentBuffer(durationSeconds, sampleRate = 16000, channels = 1) {
  const numSamples = Math.floor(durationSeconds * sampleRate * channels);
  return Buffer.alloc(numSamples * 2); // 2 bytes per int16 sample
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('AudioSlicer', () => {
  let tmpDir;
  let slicer;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    slicer = new AudioSlicer({ sampleRate: 16000, channels: 1, bitDepth: 16 });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── sliceFile ───────────────────────────────────────────────────────────

  describe('sliceFile()', () => {
    it('creates a WAV file at the output path', () => {
      const src = path.join(tmpDir, 'source.wav');
      writeSilentWav(src, 5);
      const out = path.join(tmpDir, 'clip.wav');
      slicer.sliceFile(src, 1, 2, out);
      expect(fs.existsSync(out)).toBe(true);
    });

    it('returns the resolved output path', () => {
      const src = path.join(tmpDir, 'source.wav');
      writeSilentWav(src, 5);
      const out = path.join(tmpDir, 'clip.wav');
      const result = slicer.sliceFile(src, 0, 2, out);
      expect(result).toBe(path.resolve(out));
    });

    it('throws when the source file does not exist', () => {
      expect(() => slicer.sliceFile('/nonexistent/file.wav', 0, 1, path.join(tmpDir, 'out.wav'))).toThrow();
    });

    it('output WAV has approximately the expected duration', () => {
      const src = path.join(tmpDir, 'source.wav');
      writeSilentWav(src, 10, 16000, 1);
      const out = path.join(tmpDir, 'clip.wav');
      slicer.sliceFile(src, 2, 3, out);

      const outWav = new WaveFile(fs.readFileSync(out));
      const samples = outWav.getSamples(false, Int16Array);
      const sr = outWav.fmt.sampleRate;
      const ch = outWav.fmt.numChannels;
      const actualDuration = samples.length / (sr * ch);
      expect(actualDuration).toBeCloseTo(3, 0);
    });

    it('creates parent directories if they do not exist', () => {
      const src = path.join(tmpDir, 'source.wav');
      writeSilentWav(src, 5);
      const out = path.join(tmpDir, 'sub', 'nested', 'clip.wav');
      slicer.sliceFile(src, 0, 2, out);
      expect(fs.existsSync(out)).toBe(true);
    });
  });

  // ── sliceBuffer ─────────────────────────────────────────────────────────

  describe('sliceBuffer()', () => {
    it('creates a WAV file from a raw PCM16 buffer', () => {
      const buf = silentBuffer(5);
      const out = path.join(tmpDir, 'clip.wav');
      slicer.sliceBuffer(buf, 1, 2, out);
      expect(fs.existsSync(out)).toBe(true);
    });

    it('returns the resolved output path', () => {
      const buf = silentBuffer(5);
      const out = path.join(tmpDir, 'clip.wav');
      const result = slicer.sliceBuffer(buf, 0, 2, out);
      expect(result).toBe(path.resolve(out));
    });

    it('output WAV has approximately the expected duration', () => {
      const buf = silentBuffer(10);
      const out = path.join(tmpDir, 'clip.wav');
      slicer.sliceBuffer(buf, 1, 4, out);

      const outWav = new WaveFile(fs.readFileSync(out));
      const samples = outWav.getSamples(false, Int16Array);
      const sr = outWav.fmt.sampleRate;
      const ch = outWav.fmt.numChannels;
      const actualDuration = samples.length / (sr * ch);
      expect(actualDuration).toBeCloseTo(4, 0);
    });
  });

  // ── bufferToWav ─────────────────────────────────────────────────────────

  describe('bufferToWav()', () => {
    it('wraps the entire buffer as a valid WAV', () => {
      const buf = silentBuffer(3);
      const out = path.join(tmpDir, 'full.wav');
      slicer.bufferToWav(buf, out);
      expect(fs.existsSync(out)).toBe(true);

      const outWav = new WaveFile(fs.readFileSync(out));
      expect(outWav.fmt.sampleRate).toBe(16000);
      expect(outWav.fmt.numChannels).toBe(1);
    });
  });
});
