/**
 * continuousRecorder.js – Records a continuous rolling 24-hour archive of
 * A/V segments using ffmpeg.  Each segment is a fixed duration (default 5 min).
 * Old segments are deleted automatically when they exceed maxAgeSecs.
 *
 * Recording files are stored in:
 *   data/recordings/YYYY-MM-DDTHH-MM-SS/audio.wav
 *   data/recordings/YYYY-MM-DDTHH-MM-SS/video.mp4  (if video enabled)
 *
 * The store is updated via eventStore.upsertRecording() so the API can list them.
 */

import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import ffmpegPath from 'ffmpeg-static';
import { upsertRecording, deleteRecording, listRecordings } from './eventStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REC_DIR   = join(__dirname, '..', 'data', 'recordings');

export class ContinuousRecorder extends EventEmitter {
  constructor(config) {
    super();
    this._config    = config;
    this._segTimer  = null;
    this._currentId = null;
    this._audioProc = null;
    this._videoProc = null;
    this._running   = false;

    mkdirSync(REC_DIR, { recursive: true });
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._startSegment();
  }

  stop() {
    this._running = false;
    clearTimeout(this._segTimer);
    this._stopCurrent();
  }

  // ---------------------------------------------------------------------------

  _startSegment() {
    if (!this._running) return;

    const rec   = this._config.recording;
    const segMs = (rec.segmentDuration || 300) * 1000;
    const id    = randomUUID();
    const ts    = new Date();
    const label = ts.toISOString().replace(/[:.]/g, '-');
    const dir   = join(REC_DIR, label);

    mkdirSync(dir, { recursive: true });

    const audioFile = join(dir, 'audio.wav');
    const videoFile = rec.videoEnabled ? join(dir, 'video.mp4') : null;

    this._currentId = id;

    // Start audio recording
    if (rec.audioEnabled !== false) {
      const inputArgs = _buildAudioInputArgs(rec.audioDevice);
      this._audioProc = spawn(ffmpegPath, [
        ...inputArgs,
        '-t',    String(rec.segmentDuration || 300),
        '-ar',   '44100',
        '-ac',   '2',
        '-y',
        audioFile,
      ], { stdio: ['ignore', 'ignore', 'pipe'] });

      this._audioProc.stderr.on('data', () => {});
      this._audioProc.on('error', (err) => this.emit('error', err));
    }

    // Start video recording
    if (rec.videoEnabled && videoFile) {
      const inputArgs = _buildVideoInputArgs(rec.videoDevice, rec.frameRate, rec.resolution);
      this._videoProc = spawn(ffmpegPath, [
        ...inputArgs,
        '-t',        String(rec.segmentDuration || 300),
        '-codec:v',  'libx264',
        '-preset',   'ultrafast',
        '-crf',      '28',
        '-y',
        videoFile,
      ], { stdio: ['ignore', 'ignore', 'pipe'] });

      this._videoProc.stderr.on('data', () => {});
      this._videoProc.on('error', (err) => this.emit('error', err));
    }

    upsertRecording({
      id,
      startTime: ts.getTime(),
      audioFile,
      videoFile,
      sizeBytes: 0,
    });

    // Schedule next segment
    this._segTimer = setTimeout(() => {
      this._stopCurrent();
      this._finaliseSegment(id, audioFile, videoFile, ts.getTime());
      this._cleanup();
      this._startSegment();
    }, segMs);
  }

  _stopCurrent() {
    if (this._audioProc) {
      this._audioProc.kill('SIGTERM');
      this._audioProc = null;
    }
    if (this._videoProc) {
      this._videoProc.kill('SIGTERM');
      this._videoProc = null;
    }
  }

  _finaliseSegment(id, audioFile, videoFile, startTime) {
    let sizeBytes = 0;
    try { sizeBytes += statSync(audioFile).size; } catch { /* file may not exist */ }
    if (videoFile) {
      try { sizeBytes += statSync(videoFile).size; } catch { /* optional */ }
    }

    upsertRecording({
      id,
      startTime,
      endTime: Date.now(),
      audioFile,
      videoFile,
      sizeBytes,
    });
  }

  _cleanup() {
    const maxAge  = (this._config.recording.maxAgeSecs || 86400) * 1000;
    const cutoff  = Date.now() - maxAge;

    // Remove old rows from DB and their files
    const old = listRecordings({ until: cutoff });
    for (const row of old) {
      deleteRecording(row.id);
      const dir = dirname(row.audioFile);
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch { /* best effort */ }
    }
  }
}

// ---------------------------------------------------------------------------

function _buildAudioInputArgs(device) {
  const platform = process.platform;
  if (platform === 'linux') {
    return ['-f', 'pulse', '-i', device === 'default' ? 'default' : device];
  }
  if (platform === 'darwin') {
    return ['-f', 'avfoundation', '-i', device === 'default' ? ':0' : device];
  }
  if (platform === 'win32') {
    return ['-f', 'dshow', '-i', `audio=${device === 'default' ? 'Microphone' : device}`];
  }
  return ['-f', 'lavfi', '-i', 'sine=frequency=440'];
}

function _buildVideoInputArgs(device, frameRate = 15, resolution = '640x480') {
  const platform = process.platform;
  if (platform === 'linux') {
    return ['-f', 'v4l2', '-framerate', String(frameRate), '-video_size', resolution, '-i', device === 'default' ? '/dev/video0' : device];
  }
  if (platform === 'darwin') {
    return ['-f', 'avfoundation', '-framerate', String(frameRate), '-video_size', resolution, '-i', device === 'default' ? '0' : device];
  }
  if (platform === 'win32') {
    return ['-f', 'dshow', '-framerate', String(frameRate), '-video_size', resolution, '-i', device === 'default' ? 'video=Integrated Camera' : device];
  }
  return ['-f', 'lavfi', '-i', `testsrc=size=${resolution}:rate=${frameRate}`];
}
