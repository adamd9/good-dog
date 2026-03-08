# Test Audio Dataset

This directory contains synthetic WAV audio samples used for testing the GoodDog bark detection pipeline.

## Format

All files are:
- **Encoding**: 16-bit PCM (signed, little-endian)
- **Sample rate**: 16,000 Hz (16 kHz)
- **Channels**: Mono (1 channel)
- **Container**: WAV (RIFF, 44-byte header)

## Files

| Pattern | Count | Duration | Description |
|---------|-------|----------|-------------|
| `bark_001.wav` – `bark_010.wav` | 10 | 0.3–0.8s | High-amplitude white noise bursts simulating bark energy |
| `background_001.wav` – `background_005.wav` | 5 | 5.0s | Low-amplitude white noise simulating ambient background |

> **Note:** These are synthetic samples for unit testing only. Real bark detection accuracy requires actual dog bark recordings.

## Generating the Samples

Run the generator script from the repo root:

```bash
node scripts/generate-test-audio.js
```

The script requires no external dependencies — it uses only Node.js built-ins (`fs`, `path`, `crypto`) to write raw WAV files.

### How it works

```js
// 1. Build a 44-byte WAV header for 16-bit PCM mono at 16 kHz
function createWavHeader(numSamples, sampleRate = 16000) { ... }

// 2. Generate white noise at a given amplitude (0.0 – 1.0)
//    amplitude 0.8 → bark-like burst
//    amplitude 0.02 → quiet background
function generateNoise(numSamples, amplitude) { ... }

// 3. Write header + samples to disk
fs.writeFileSync(filePath, Buffer.concat([header, samples]));
```

### Manual generation example

```js
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 16000;
const INT16_MAX = 32767;

function createWavHeader(numSamples, sampleRate = SAMPLE_RATE) {
  const byteRate = sampleRate * 2;       // 16-bit mono
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);             // PCM chunk size
  buf.writeUInt16LE(1, 20);              // PCM format
  buf.writeUInt16LE(1, 22);              // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(2, 32);              // block align
  buf.writeUInt16LE(16, 34);             // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

function generateNoise(numSamples, amplitude) {
  const buf = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round((Math.random() * 2 - 1) * amplitude * INT16_MAX);
    buf.writeInt16LE(sample, i * 2);
  }
  return buf;
}

// Generate one bark sample (0.5 s at high amplitude)
const nSamples = Math.round(0.5 * SAMPLE_RATE);
const wav = Buffer.concat([
  createWavHeader(nSamples),
  generateNoise(nSamples, 0.8),
]);
fs.writeFileSync(path.join(__dirname, '../data/test-audio/bark_001.wav'), wav);
```
