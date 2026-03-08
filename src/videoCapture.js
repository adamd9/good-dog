/**
 * videoCapture.js – Captures video from a camera via ffmpeg and streams MJPEG
 * frames to registered WebSocket clients.
 *
 * Emits:
 *   'frame'  – Buffer containing a JPEG image
 *   'error'  – Error
 */

import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { ffmpegPath } from './ffmpegResolver.js';

const JPEG_SOI = Buffer.from([0xff, 0xd8]); // JPEG start-of-image marker
const JPEG_EOI = Buffer.from([0xff, 0xd9]); // JPEG end-of-image marker

export class VideoCapture extends EventEmitter {
  /**
   * @param {object} config  Merged app config
   */
  constructor(config) {
    super();
    this._config  = config;
    this._process = null;
    this._parseBuf = Buffer.alloc(0);
    this._retryTimer = null;
    this._stopping = false;
    this._attempt = 0;
    this._seenFrame = false;
  }

  start() {
    if (this._process || this._retryTimer) return;

    this._stopping = false;
    this._attempt = 0;

    const startupDelayMs = _envNumber('VIDEO_START_DELAY_MS', process.platform === 'darwin' ? 1500 : 0);
    const maxRetries = _envNumber('VIDEO_OPEN_RETRIES', process.platform === 'darwin' ? 4 : 0);
    const retryDelayMs = _envNumber('VIDEO_RETRY_DELAY_MS', 1200);

    if (startupDelayMs > 0) {
      console.log(`[video] delaying ffmpeg start by ${startupDelayMs}ms`);
      this._retryTimer = setTimeout(() => {
        this._retryTimer = null;
        this._startAttempt(maxRetries, retryDelayMs);
      }, startupDelayMs);
      return;
    }

    this._startAttempt(maxRetries, retryDelayMs);
  }

  _startAttempt(maxRetries, retryDelayMs) {
    if (this._stopping || this._process) return;

    this._attempt += 1;

    const rec = this._config.recording;
    const inputArgs = _buildVideoInputArgs(
      rec.videoDevice,
      rec.frameRate   || 15,
      rec.resolution  || '640x480'
    );

    const args = [
      ...inputArgs,
      '-f',       'mjpeg',
      '-q:v',     '5',
      'pipe:1',
    ];

    console.log(`[video] ffmpeg start attempt ${this._attempt}/${maxRetries + 1}: ${ffmpegPath} ${args.join(' ')}`);

    this._process = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this._seenFrame = false;

    let stderrTail = '';
    let stderrFull = '';
    this._process.stdout.on('data', (chunk) => {
      this._seenFrame = true;
      this._parseBuf = Buffer.concat([this._parseBuf, chunk]);
      this._parseFrames();
    });

    this._process.stderr.on('data', (d) => {
      const text = d.toString();
      stderrTail = (stderrTail + text).slice(-2000);
      stderrFull = (stderrFull + text).slice(-12000);
      // Suppress noisy ffmpeg progress lines (frame=… fps=… size=… time=…)
      if (!/^\s*frame=/.test(text)) {
        process.stderr.write(`[video:ffmpeg] ${text}`);
      }
    });

    this._process.on('error', (err) => this.emit('error', err));
    this._process.on('exit', (code) => {
      this._process = null;
      if (this._stopping) return;

      const cameraLock = process.platform === 'darwin' && _isCameraLockError(stderrTail);
      const canRetry = cameraLock && !this._seenFrame && this._attempt <= maxRetries;

      if (code !== 0 && code !== null) {
        console.warn(
          `[video] ffmpeg exited (code=${code}, attempt=${this._attempt}/${maxRetries + 1}, ` +
          `cameraLock=${cameraLock}, seenFrame=${this._seenFrame})`
        );
      }

      if (canRetry) {
        const waitMs = retryDelayMs * this._attempt;
        console.warn(`[video] camera lock detected; retrying ffmpeg in ${waitMs}ms`);
        this._retryTimer = setTimeout(() => {
          this._retryTimer = null;
          this._startAttempt(maxRetries, retryDelayMs);
        }, waitMs);
        return;
      }

      if (code !== 0 && code !== null) {
        let msg = `ffmpeg video exited with code ${code}`;
        if (stderrFull) msg += `\nffmpeg output:\n${stderrFull.trim()}`;
        if (process.platform === 'darwin' && stderrTail.includes('Input/output error')) {
          msg += '\n\nHint: On macOS, grant Camera access to your terminal app at\n' +
                 'System Settings → Privacy & Security → Camera.';
        }
        this.emit('error', new Error(msg));
      }
    });
  }

  stop() {
    this._stopping = true;

    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }

    if (this._process) {
      this._process.kill('SIGTERM');
      this._process = null;
      this._parseBuf = Buffer.alloc(0);
    }
  }

  // ---------------------------------------------------------------------------

  _parseFrames() {
    while (true) {
      const soi = this._parseBuf.indexOf(JPEG_SOI);
      if (soi === -1) {
        this._parseBuf = Buffer.alloc(0);
        break;
      }

      const eoi = this._parseBuf.indexOf(JPEG_EOI, soi + 2);
      if (eoi === -1) break; // incomplete frame – wait for more data

      const frame = this._parseBuf.slice(soi, eoi + 2);
      this._parseBuf = this._parseBuf.slice(eoi + 2);
      this.emit('frame', frame);
    }
  }
}

// ---------------------------------------------------------------------------

function _envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function _isCameraLockError(stderr) {
  return (
    stderr.includes('Could not lock device for configuration') ||
    stderr.includes('Error opening input') ||
    stderr.includes('Input/output error')
  );
}

function _buildVideoInputArgs(device, frameRate, resolution) {
  const platform = process.platform;

  if (platform === 'linux') {
    const src = device === 'default' ? '/dev/video0' : device;
    return ['-f', 'v4l2', '-framerate', String(frameRate), '-video_size', resolution, '-i', src];
  }
  if (platform === 'darwin') {
    const src = device === 'default' ? '0' : device;
    // AVFoundation requires the exact device framerate at input time.
    // The device reports a range [15–30] fps; we capture at 30 (the max)
    // and decimate to the desired rate via an output fps filter.
    const [w, h] = resolution.split('x');
    return [
      '-f', 'avfoundation',
      '-framerate', '30',
      '-i', src,
      '-vf', `scale=${w}:${h},fps=${frameRate}`,
    ];
  }
  if (platform === 'win32') {
    const src = device === 'default' ? 'video=Integrated Camera' : device;
    return ['-f', 'dshow', '-framerate', String(frameRate), '-video_size', resolution, '-i', src];
  }
  // Fallback – test pattern (CI/demo)
  return ['-f', 'lavfi', '-i', `testsrc=size=${resolution}:rate=${frameRate}`];
}
