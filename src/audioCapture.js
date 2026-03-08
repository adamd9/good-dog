/**
 * audioCapture.js – Captures audio from a microphone via ffmpeg, maintains a
 * ring buffer, runs BarkDetector on the stream, and saves audio clips on bark.
 *
 * Emits:
 *   'level'  – { rms: number, peak: number }   (every ~100 ms)
 *   'bark'   – BarkEvent extended with { audioFile: string }
 *   'error'  – Error
 */

import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ffmpegPath } from './ffmpegResolver.js';
import { BarkDetector } from './barkDetector.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = join(__dirname, '..', 'data', 'events');

const SAMPLE_RATE = 16000;
const CHANNELS    = 1;
const BYTES_PER_SAMPLE = 2; // 16-bit

export class AudioCapture extends EventEmitter {
  /**
   * @param {object} config  Merged app config object
   */
  constructor(config) {
    super();
    this._config  = config;
    this._process = null;
    this._ring    = null;
    this._detector = null;
    this._levelAccum = Buffer.alloc(0);
    this._levelWindowBytes = SAMPLE_RATE * BYTES_PER_SAMPLE * 0.1; // 100 ms window
    this._pendingClips = new Map(); // eventId → { startTs, afterBytes, collected }

    mkdirSync(EVENTS_DIR, { recursive: true });
  }

  start() {
    if (this._process) return;

    const det = this._config.detection;
    const rec = this._config.recording;

    const beforeSecs = (det.beforeBuffer || 5) + 2; // extra slack
    const ringBytes  = Math.ceil(SAMPLE_RATE * beforeSecs * BYTES_PER_SAMPLE);
    this._ring = new RingBuffer(ringBytes);

    this._detector = new BarkDetector({
      sampleRate:  SAMPLE_RATE,
      threshold:   det.threshold,
      minDuration: det.minDuration,
    });
    this._detector.on('bark', (event) => this._onBark(event));

    const inputArgs = _buildInputArgs(rec.audioDevice);
    const args = [
      ...inputArgs,
      '-ar', String(SAMPLE_RATE),
      '-ac', String(CHANNELS),
      '-f',  's16le',
      'pipe:1',
    ];

    this._process = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderrTail = '';
    this._process.stdout.on('data', (chunk) => {
      this._ring.write(chunk);
      this._detector.process(chunk);
      this._accumulateLevel(chunk);
      this._feedPendingClips(chunk);
    });

    this._process.stderr.on('data', (d) => {
      stderrTail = (stderrTail + d.toString()).slice(-1000);
    });

    this._process.on('error', (err) => this.emit('error', err));
    this._process.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        const hint = stderrTail ? `\nffmpeg output:\n${stderrTail.trim()}` : '';
        this.emit('error', new Error(`ffmpeg audio exited with code ${code}${hint}`));
      }
    });
  }

  stop() {
    if (this._process) {
      this._process.kill('SIGTERM');
      this._process = null;
    }
    if (this._detector) {
      this._detector.removeAllListeners();
      this._detector = null;
    }
  }

  // ---------------------------------------------------------------------------

  _accumulateLevel(chunk) {
    this._levelAccum = Buffer.concat([this._levelAccum, chunk]);

    while (this._levelAccum.length >= this._levelWindowBytes) {
      const window = this._levelAccum.slice(0, this._levelWindowBytes);
      this._levelAccum = this._levelAccum.slice(this._levelWindowBytes);

      let sumSq = 0;
      let peak  = 0;
      const N   = window.length / BYTES_PER_SAMPLE;
      for (let i = 0; i < N; i++) {
        const s = window.readInt16LE(i * BYTES_PER_SAMPLE) / 32768;
        sumSq += s * s;
        if (Math.abs(s) > peak) peak = Math.abs(s);
      }
      this.emit('level', { rms: Math.sqrt(sumSq / N), peak });
    }
  }

  _onBark(event) {
    const det = this._config.detection;
    const beforeBytes = Math.ceil(
      (det.beforeBuffer || 5) * SAMPLE_RATE * BYTES_PER_SAMPLE
    );
    const afterBytes  = Math.ceil(
      (det.afterBuffer  || 10) * SAMPLE_RATE * BYTES_PER_SAMPLE
    );

    // Capture the pre-bark audio from the ring buffer
    const preBark = this._ring.getLastBytes(beforeBytes);
    const id      = randomUUID();
    const audioFile = join(EVENTS_DIR, `${id}.wav`);

    // Write WAV header + pre-bark audio; accumulate post-bark below
    const wavStream = createWriteStream(audioFile);
    _writeWavHeader(wavStream, SAMPLE_RATE, CHANNELS);
    wavStream.write(preBark);

    this._pendingClips.set(id, {
      event,
      audioFile,
      wavStream,
      afterBytes,
      collected: 0,
    });

    // Schedule a timeout in case audio stops before afterBuffer fills
    setTimeout(() => this._finaliseClip(id), (det.afterBuffer + 2) * 1000);
  }

  _feedPendingClips(chunk) {
    for (const [id, clip] of this._pendingClips) {
      const remaining = clip.afterBytes - clip.collected;
      if (remaining <= 0) {
        this._finaliseClip(id);
        continue;
      }
      const slice = chunk.slice(0, remaining);
      clip.wavStream.write(slice);
      clip.collected += slice.length;

      if (clip.collected >= clip.afterBytes) {
        this._finaliseClip(id);
      }
    }
  }

  _finaliseClip(id) {
    const clip = this._pendingClips.get(id);
    if (!clip) return;
    this._pendingClips.delete(id);

    clip.wavStream.end(() => {
      this.emit('bark', {
        ...clip.event,
        audioFile: clip.audioFile,
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Ring buffer – stores the most recent N bytes, wrapping on overflow
// ---------------------------------------------------------------------------

class RingBuffer {
  constructor(capacity) {
    this._buf      = Buffer.alloc(capacity);
    this._capacity = capacity;
    this._writePos = 0;
    this._filled   = false;
  }

  write(data) {
    if (data.length >= this._capacity) {
      const start = data.length - this._capacity;
      data.copy(this._buf, 0, start);
      this._writePos = 0;
      this._filled   = true;
      return;
    }

    const end = this._writePos + data.length;
    if (end <= this._capacity) {
      data.copy(this._buf, this._writePos);
      this._writePos = end === this._capacity ? 0 : end;
    } else {
      const firstPart = this._capacity - this._writePos;
      data.copy(this._buf, this._writePos, 0, firstPart);
      data.copy(this._buf, 0, firstPart);
      this._writePos = data.length - firstPart;
      this._filled   = true;
    }

    if (this._writePos === 0) this._filled = true;
  }

  /** Return up to `byteCount` of the most recently written bytes. */
  getLastBytes(byteCount) {
    byteCount = Math.min(byteCount, this._capacity);

    const available = this._filled ? this._capacity : this._writePos;
    const take      = Math.min(byteCount, available);

    if (take === 0) return Buffer.alloc(0);

    const out = Buffer.allocUnsafe(take);
    let readPos = (this._writePos - take + this._capacity) % this._capacity;

    if (readPos + take <= this._capacity) {
      this._buf.copy(out, 0, readPos, readPos + take);
    } else {
      const firstPart = this._capacity - readPos;
      this._buf.copy(out, 0, readPos, this._capacity);
      this._buf.copy(out, firstPart, 0, take - firstPart);
    }

    return out;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _buildInputArgs(device) {
  const platform = process.platform;

  if (platform === 'linux') {
    // Try pulse first, then ALSA
    const src = device === 'default' ? 'default' : device;
    return ['-f', 'pulse', '-i', src];
  }
  if (platform === 'darwin') {
    // Use none:<index> to open the audio device only.
    // Using :<index> alone causes avfoundation to also initialise the default
    // video device, which fails with I/O error if camera access is blocked.
    const src = device === 'default' ? '0' : device;
    return ['-f', 'avfoundation', '-i', `none:${src}`];
  }
  if (platform === 'win32') {
    const src = device === 'default' ? 'Microphone' : device;
    return ['-f', 'dshow', '-i', `audio=${src}`];
  }
  // Fallback – use lavfi test signal (useful in CI / demo)
  return ['-f', 'lavfi', '-i', 'sine=frequency=1000:duration=999999'];
}

/**
 * Write a minimal WAV header to the stream.
 * Data size is set to the maximum (0xFFFFFFFF) since we're streaming.
 */
function _writeWavHeader(stream, sampleRate, channels) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * BYTES_PER_SAMPLE;

  header.write('RIFF',      0);
  header.writeUInt32LE(0xFFFFFFFF, 4);
  header.write('WAVE',      8);
  header.write('fmt ',      12);
  header.writeUInt32LE(16,  16); // PCM chunk size
  header.writeUInt16LE(1,   20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate,   28);
  header.writeUInt16LE(channels * BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16,  34); // bits per sample
  header.write('data',      36);
  header.writeUInt32LE(0xFFFFFFFF, 40);

  stream.write(header);
}
