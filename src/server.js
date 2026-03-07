/**
 * good-dog server
 *
 * Provides:
 *  - REST API  (/api/*)
 *  - Static file serving (public/)
 *  - Socket.io real-time channel for live detection events
 *  - Continuous audio recording
 *  - Bark detection pipeline
 */
'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');

const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const config = require('./config');
const BarkDetector = require('./barkDetector');
const AudioCapture = require('./audioCapture');
const ContinuousRecorder = require('./continuousRecorder');
const AudioSlicer = require('./audioSlicer');
const EventStore = require('./eventStore');

// ─── Initialise components ───────────────────────────────────────────────────

const detector = new BarkDetector({
  mode: config.detection.mode,
  sampleRate: config.audio.sampleRate,
  threshold: config.detection.threshold,
  stubEventProbability: config.detection.stubEventProbability,
});

const capture = new AudioCapture({
  mode: config.audio.captureMode,
  sampleRate: config.audio.sampleRate,
  channels: config.audio.channels,
  chunkSize: config.audio.chunkSize,
});

const recorder = new ContinuousRecorder({
  recordingsDir: config.storage.recordingsDir,
  sampleRate: config.audio.sampleRate,
  channels: config.audio.channels,
  bitDepth: config.audio.bitDepth,
  blockSeconds: config.storage.recordingBlockSeconds,
});

const slicer = new AudioSlicer({
  sampleRate: config.audio.sampleRate,
  channels: config.audio.channels,
  bitDepth: config.audio.bitDepth,
});

const eventStore = new EventStore({
  metaFile: config.storage.eventsMetaFile,
  eventsDir: config.storage.eventsDir,
});

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── REST API ─────────────────────────────────────────────────────────────────

/**
 * GET /api/status
 * Returns current monitoring status and configuration.
 */
app.get('/api/status', (_req, res) => {
  res.json({
    monitoring: capture.isRecording,
    mode: config.detection.mode,
    captureMode: config.audio.captureMode,
    threshold: config.detection.threshold,
    sampleRate: config.audio.sampleRate,
  });
});

/**
 * POST /api/monitoring/start
 * Start bark monitoring and continuous recording.
 */
app.post('/api/monitoring/start', (_req, res) => {
  if (capture.isRecording) {
    return res.json({ started: false, reason: 'Already monitoring' });
  }
  recorder.start(capture);
  return res.json({ started: true });
});

/**
 * POST /api/monitoring/stop
 * Stop bark monitoring and flush current recording block.
 */
app.post('/api/monitoring/stop', async (_req, res) => {
  if (!capture.isRecording) {
    return res.json({ stopped: false, reason: 'Not monitoring' });
  }
  capture.stop();
  await recorder.stop();
  return res.json({ stopped: true });
});

/**
 * GET /api/events
 * List detection events, optionally filtered by ?from=&to= (ISO 8601).
 */
app.get('/api/events', (req, res) => {
  const filter = {};
  if (req.query.from) filter.from = req.query.from;
  if (req.query.to) filter.to = req.query.to;
  res.json(eventStore.getEvents(filter));
});

/**
 * GET /api/events/:id
 * Get a single detection event by id.
 */
app.get('/api/events/:id', (req, res) => {
  const event = eventStore.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Not found' });
  return res.json(event);
});

/**
 * GET /api/events/:id/audio
 * Stream the WAV clip for an event.
 */
app.get('/api/events/:id/audio', (req, res) => {
  const event = eventStore.getEventById(req.params.id);
  if (!event || !event.audioFile) {
    return res.status(404).json({ error: 'Audio not found' });
  }
  const filePath = path.resolve(event.audioFile);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file missing from disk' });
  }
  res.setHeader('Content-Type', 'audio/wav');
  return res.sendFile(filePath);
});

/**
 * GET /api/recordings
 * List continuous recording files.
 */
app.get('/api/recordings', (_req, res) => {
  res.json(recorder.listRecordings());
});

/**
 * GET /api/recordings/:filename
 * Stream a continuous recording WAV file.
 */
app.get('/api/recordings/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(config.storage.recordingsDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Recording not found' });
  }
  res.setHeader('Content-Type', 'audio/wav');
  return res.sendFile(filePath);
});

// ─── Audio pipeline ───────────────────────────────────────────────────────────

/**
 * Keep a rolling pre-event buffer so we can slice audio before the detection.
 * We use the recorder's ring buffer in practice, but keep a local buffer for
 * the pre-pad in case the recorder has not yet been started.
 */
const PRE_PAD_BYTES = Math.floor(
  config.detection.prePadSeconds *
    config.audio.sampleRate *
    config.audio.channels *
    (config.audio.bitDepth / 8),
);
const POST_PAD_MS = config.detection.postPadSeconds * 1000;

let _preBuffer = Buffer.alloc(0);

capture.on('data', (chunk) => {
  // Maintain pre-event buffer
  _preBuffer = Buffer.concat([_preBuffer, chunk]);
  if (_preBuffer.length > PRE_PAD_BYTES) {
    _preBuffer = _preBuffer.slice(_preBuffer.length - PRE_PAD_BYTES);
  }

  const probability = detector.analyze(chunk);

  // Always broadcast the current level for the live waveform
  io.emit('level', { probability, timestamp: new Date().toISOString() });

  if (detector.isBark(probability)) {
    handleBarkEvent(probability, chunk);
  }
});

capture.on('error', (err) => {
  console.error('[AudioCapture error]', err.message);
  io.emit('error', { message: err.message });
});

recorder.on('file-saved', (info) => {
  console.log(`[Recorder] Block saved: ${info.path}`);
  io.emit('recording-saved', { path: info.path, startTime: info.startTime, endTime: info.endTime });
});

/**
 * Handle a confirmed bark event:
 *  1. Create an event record.
 *  2. Wait for the post-pad, then slice the audio clip.
 *  3. Persist the event and broadcast it via Socket.io.
 */
function handleBarkEvent(probability, triggerChunk) {
  const id = uuidv4();
  const timestamp = new Date();

  console.log(`[Detection] Bark event ${id} at ${timestamp.toISOString()} (p=${probability.toFixed(3)})`);

  // Broadcast immediately so the UI can react
  const eventPayload = {
    id,
    timestamp: timestamp.toISOString(),
    probability,
    audioFile: null,
    duration: null,
  };
  io.emit('bark-detected', eventPayload);

  // After the post-pad window, capture the ring buffer and slice the clip
  setTimeout(() => {
    const ringBuf = recorder.getRingBuffer();
    const totalSeconds = config.detection.prePadSeconds + config.detection.postPadSeconds;
    const clipFilename = `event_${id}.wav`;
    const clipPath = path.join(config.storage.eventsDir, clipFilename);

    let audioFile = null;
    try {
      if (ringBuf.length > 0) {
        const startSeconds = Math.max(0, ringBuf.length / (config.audio.sampleRate * config.audio.channels * 2) - totalSeconds);
        slicer.sliceBuffer(ringBuf, startSeconds, totalSeconds, clipPath);
        audioFile = clipPath;
      }
    } catch (err) {
      console.error('[Slicer] Failed to save clip:', err.message);
    }

    const stored = eventStore.addEvent({
      id,
      timestamp: timestamp.toISOString(),
      probability,
      audioFile,
      duration: totalSeconds,
    });

    // Broadcast the updated event (now with audioFile)
    io.emit('bark-event-saved', stored);
  }, POST_PAD_MS);
}

// ─── Socket.io ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  // Send current status on connection
  socket.emit('status', {
    monitoring: capture.isRecording,
    threshold: config.detection.threshold,
    mode: config.detection.mode,
    events: eventStore.getEvents(),
    recordings: recorder.listRecordings(),
  });

  socket.on('start-monitoring', () => {
    if (!capture.isRecording) {
      recorder.start(capture);
    }
    io.emit('monitoring-state', { monitoring: true });
  });

  socket.on('stop-monitoring', async () => {
    if (capture.isRecording) {
      capture.stop();
      await recorder.stop();
    }
    io.emit('monitoring-state', { monitoring: false });
  });

  socket.on('set-threshold', (data) => {
    const t = parseFloat(data.threshold);
    if (!isNaN(t) && t >= 0 && t <= 1) {
      detector.threshold = t;
      io.emit('config-updated', { threshold: t });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────

function start() {
  server.listen(config.server.port, config.server.host, () => {
    console.log(`good-dog running at http://localhost:${config.server.port}`);
    console.log(`  Detection mode : ${config.detection.mode}`);
    console.log(`  Capture mode   : ${config.audio.captureMode}`);
    console.log(`  Threshold      : ${config.detection.threshold}`);
  });
}

// Allow the module to be required by tests without auto-starting the server
if (require.main === module) {
  start();
}

module.exports = { app, server, capture, recorder, detector, eventStore, start };
