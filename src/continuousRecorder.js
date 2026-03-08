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
    this._finalizeOrphanedSegments();
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

    const rec     = this._config.recording;
    const segMs   = (rec.segmentDuration || 300) * 1000;
    const segSecs = rec.segmentDuration || 300;
    const id      = randomUUID();
    const ts      = new Date();
    const label   = ts.toISOString().replace(/[:.]/g, '-');
    const dir     = join(REC_DIR, label);

    mkdirSync(dir, { recursive: true });

    // When both A/V are enabled, mux into a single mp4 (one ffmpeg process).
    // When only one stream is enabled, record separately.
    const bothAV    = rec.videoEnabled && rec.audioEnabled !== false;
    const audioFile = bothAV ? null : (rec.audioEnabled !== false ? join(dir, 'audio.wav') : null);
    const videoFile = rec.videoEnabled ? join(dir, 'recording.mp4') : null;

    this._currentId = id;

    if (bothAV) {
      // Single combined process
      const inputArgs = _buildCombinedInputArgs(
        rec.videoDevice, rec.audioDevice, rec.frameRate || 30, rec.resolution || '640x480'
      );
      this._videoProc = spawn(ffmpegPath, [
        ...inputArgs,
        '-t',       String(segSecs),
        '-codec:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
        '-codec:a', 'aac', '-ar', '44100',
        '-y', videoFile,
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      this._videoProc.stderr.on('data', () => {});
      this._videoProc.on('error', (err) => this.emit('error', err));
      this._audioProc = null;
    } else {
      // Audio-only
      if (rec.audioEnabled !== false && audioFile) {
        const inputArgs = _buildAudioInputArgs(rec.audioDevice);
        this._audioProc = spawn(ffmpegPath, [
          ...inputArgs,
          '-t', String(segSecs), '-ar', '44100', '-ac', '2', '-y', audioFile,
        ], { stdio: ['ignore', 'ignore', 'pipe'] });
        this._audioProc.stderr.on('data', () => {});
        this._audioProc.on('error', (err) => this.emit('error', err));
      }
      // Video-only (no audio)
      if (rec.videoEnabled && videoFile) {
        const inputArgs = _buildVideoInputArgs(rec.videoDevice, rec.frameRate, rec.resolution);
        this._videoProc = spawn(ffmpegPath, [
          ...inputArgs,
          '-t', String(segSecs),
          '-codec:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
          '-an', '-y', videoFile,
        ], { stdio: ['ignore', 'ignore', 'pipe'] });
        this._videoProc.stderr.on('data', () => {});
        this._videoProc.on('error', (err) => this.emit('error', err));
      }
    }

    upsertRecording({ id, startTime: ts.getTime(), audioFile, videoFile, sizeBytes: 0 });

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
    if (audioFile) { try { sizeBytes += statSync(audioFile).size; } catch { /* may not exist */ } }
    if (videoFile) { try { sizeBytes += statSync(videoFile).size; } catch { /* optional */ } }

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
    const maxAge = (this._config.recording.maxAgeSecs || 86400) * 1000;
    const cutoff = Date.now() - maxAge;

    const old = listRecordings({ until: cutoff });
    for (const row of old) {
      deleteRecording(row.id);
      // audioFile may be null for combined recordings; fall back to videoFile for the dir
      const anyFile = row.audioFile || row.videoFile;
      if (!anyFile) continue;
      const dir = dirname(anyFile);
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }

  /** Close any segments left open by a previous unclean shutdown. */
  _finalizeOrphanedSegments() {
    const segMs = (this._config.recording.segmentDuration || 300) * 1000;
    const open  = listRecordings().filter((r) => !r.endTime);
    for (const row of open) {
      // Cap at startTime + segmentDuration so gaps during shutdown are visible
      const inferredEnd = Math.min(Date.now(), row.startTime + segMs);
      upsertRecording({ ...row, endTime: inferredEnd });
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

/**
 * Build ffmpeg input args for simultaneous audio+video capture into one stream.
 * macOS: AVFoundation "videoIdx:audioIdx"
 * Linux: v4l2 + pulse as two inputs
 * Windows: dshow combined
 */
function _buildCombinedInputArgs(videoDevice, audioDevice, frameRate = 30, resolution = '640x480') {
  const platform = process.platform;

  if (platform === 'darwin') {
    const vIdx = videoDevice === 'default' ? '0' : videoDevice;
    // audioDevice is stored as ':0', ':1' etc for audio-only; strip leading colon for combined
    const aIdx = (audioDevice === 'default' ? '0' : audioDevice).replace(/^:/, '');
    const [w, h] = resolution.split('x');
    return [
      '-f', 'avfoundation',
      '-framerate', '30',
      '-i', `${vIdx}:${aIdx}`,
      '-vf', `scale=${w}:${h},fps=${frameRate}`,
    ];
  }
  if (platform === 'linux') {
    const vSrc = videoDevice === 'default' ? '/dev/video0' : videoDevice;
    const aSrc = audioDevice === 'default' ? 'default' : audioDevice;
    return [
      '-f', 'v4l2', '-framerate', String(frameRate), '-video_size', resolution, '-i', vSrc,
      '-f', 'pulse', '-i', aSrc,
    ];
  }
  if (platform === 'win32') {
    const vSrc = videoDevice === 'default' ? 'Integrated Camera' : videoDevice;
    const aSrc = audioDevice === 'default' ? 'Microphone' : audioDevice;
    return [
      '-f', 'dshow', '-framerate', String(frameRate), '-video_size', resolution,
      '-i', `video=${vSrc}:audio=${aSrc}`,
    ];
  }
  // Fallback – test pattern + sine tone
  return [
    '-f', 'lavfi', '-i', `testsrc=size=${resolution}:rate=${frameRate}`,
    '-f', 'lavfi', '-i', 'sine=frequency=440',
  ];
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
