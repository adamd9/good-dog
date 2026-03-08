#!/usr/bin/env node
/**
 * Generates synthetic WAV test audio files for GoodDog unit tests.
 *
 * Output:
 *   data/test-audio/bark_001.wav  … bark_010.wav      (high-energy bursts)
 *   data/test-audio/background_001.wav … background_005.wav  (quiet noise)
 *
 * Format: 16-bit PCM, 16 kHz, mono, 44-byte WAV header.
 * No external dependencies — pure Node.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 16000;
const INT16_MAX = 32767;
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'test-audio');

/**
 * Build a standard 44-byte WAV/RIFF header for 16-bit PCM mono audio.
 * @param {number} numSamples - Total number of audio samples.
 * @param {number} sampleRate - Sample rate in Hz (default 16000).
 * @returns {Buffer} 44-byte header buffer.
 */
function createWavHeader(numSamples, sampleRate = SAMPLE_RATE) {
  const byteRate = sampleRate * 2; // 16-bit mono: 2 bytes per sample
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);   // ChunkSize
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);             // Subchunk1Size (PCM = 16)
  buf.writeUInt16LE(1, 20);              // AudioFormat: PCM
  buf.writeUInt16LE(1, 22);              // NumChannels: mono
  buf.writeUInt32LE(sampleRate, 24);     // SampleRate
  buf.writeUInt32LE(byteRate, 28);       // ByteRate
  buf.writeUInt16LE(2, 32);              // BlockAlign: 2 bytes per frame
  buf.writeUInt16LE(16, 34);             // BitsPerSample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);       // Subchunk2Size

  return buf;
}

/**
 * Generate white noise samples at a given amplitude.
 * @param {number} numSamples - Number of samples to generate.
 * @param {number} amplitude  - Peak amplitude as a fraction of INT16_MAX (0.0–1.0).
 * @returns {Buffer} Raw 16-bit PCM sample buffer (little-endian).
 */
function generateNoise(numSamples, amplitude) {
  const buf = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    // Uniform white noise in [-amplitude, +amplitude]
    const sample = Math.round((Math.random() * 2 - 1) * amplitude * INT16_MAX);
    buf.writeInt16LE(sample, i * 2);
  }
  return buf;
}

/**
 * Write a WAV file from a noise burst.
 * @param {string} filePath   - Destination file path.
 * @param {number} durationS  - Duration in seconds.
 * @param {number} amplitude  - Peak amplitude fraction (0.0–1.0).
 */
function writeWav(filePath, durationS, amplitude) {
  const numSamples = Math.round(durationS * SAMPLE_RATE);
  const header = createWavHeader(numSamples);
  const samples = generateNoise(numSamples, amplitude);
  fs.writeFileSync(filePath, Buffer.concat([header, samples]));
}

function zeroPad(n, width = 3) {
  return String(n).padStart(width, '0');
}

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// --- Bark samples -----------------------------------------------------------
// 10 files, 0.3–0.8 s duration, high amplitude (0.75–0.90) to simulate bark energy.
const BARK_COUNT = 10;
const BARK_MIN_S = 0.3;
const BARK_MAX_S = 0.8;
const BARK_AMP_MIN = 0.75;
const BARK_AMP_MAX = 0.90;

for (let i = 1; i <= BARK_COUNT; i++) {
  const duration = BARK_MIN_S + (Math.random() * (BARK_MAX_S - BARK_MIN_S));
  const amplitude = BARK_AMP_MIN + (Math.random() * (BARK_AMP_MAX - BARK_AMP_MIN));
  const filename = `bark_${zeroPad(i)}.wav`;
  const filePath = path.join(OUTPUT_DIR, filename);
  writeWav(filePath, duration, amplitude);
  console.log(`Created ${filename}  (${duration.toFixed(2)}s, amp=${amplitude.toFixed(2)})`);
}

// --- Background samples -----------------------------------------------------
// 5 files, 5.0 s duration, very low amplitude (0.01–0.03) for ambient noise.
const BG_COUNT = 5;
const BG_DURATION_S = 5.0;
const BG_AMP_MIN = 0.01;
const BG_AMP_MAX = 0.03;

for (let i = 1; i <= BG_COUNT; i++) {
  const amplitude = BG_AMP_MIN + (Math.random() * (BG_AMP_MAX - BG_AMP_MIN));
  const filename = `background_${zeroPad(i)}.wav`;
  const filePath = path.join(OUTPUT_DIR, filename);
  writeWav(filePath, BG_DURATION_S, amplitude);
  console.log(`Created ${filename}  (${BG_DURATION_S}s, amp=${amplitude.toFixed(3)})`);
}

console.log(`\nDone — wrote ${BARK_COUNT + BG_COUNT} files to ${OUTPUT_DIR}`);
