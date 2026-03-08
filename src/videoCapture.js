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
  }

  start() {
    if (this._process) return;

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

    this._process = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderrTail = '';
    this._process.stdout.on('data', (chunk) => {
      this._parseBuf = Buffer.concat([this._parseBuf, chunk]);
      this._parseFrames();
    });

    this._process.stderr.on('data', (d) => {
      stderrTail = (stderrTail + d.toString()).slice(-1000);
    });

    this._process.on('error', (err) => this.emit('error', err));
    this._process.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        let msg = `ffmpeg video exited with code ${code}`;
        if (stderrTail) msg += `\nffmpeg output:\n${stderrTail.trim()}`;
        if (process.platform === 'darwin' && stderrTail.includes('Input/output error')) {
          msg += '\n\nHint: On macOS, grant Camera access to your terminal app at\n' +
                 'System Settings → Privacy & Security → Camera.';
        }
        this.emit('error', new Error(msg));
      }
    });
  }

  stop() {
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
