/**
 * server.js – Main entry point.
 *
 * Sets up:
 *  - HTTP server with static file serving and REST API
 *  - WebSocket server for real-time A/V streaming and event push
 *  - AudioCapture + BarkDetector pipeline
 *  - VideoCapture (MJPEG) pipeline
 *  - ContinuousRecorder (rolling 24-hour archive)
 *  - NotificationService dispatch on bark events
 *  - EventStore persistence
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { loadConfig } from './config.js';
import { getDb } from './db.js';
import { Router } from './router.js';
import { AudioCapture } from './audioCapture.js';
import { VideoCapture } from './videoCapture.js';
import { ContinuousRecorder } from './continuousRecorder.js';
import { createEvent } from './eventStore.js';
import { maybeNotify } from './notificationService.js';
import { registerConfigRoutes } from './api/configRoutes.js';
import { registerEventRoutes } from './api/eventRoutes.js';
import { registerRecordingRoutes } from './api/recordingRoutes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const config = loadConfig();
getDb(); // initialise schema

const router = new Router();

// Static file middleware
router.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const urlPath = req.url.split('?')[0];
  if (urlPath.startsWith('/api/') || urlPath.startsWith('/ws')) return next();

  const filePath = urlPath === '/' || urlPath === ''
    ? join(PUBLIC_DIR, 'index.html')
    : join(PUBLIC_DIR, urlPath);

  // Guard against path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end(); return;
  }

  if (!existsSync(filePath)) return next();

  const ext  = extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const size = statSync(filePath).size;

  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': size });
  createReadStream(filePath).pipe(res);
});

// API routes
registerConfigRoutes(router);
registerEventRoutes(router);
registerRecordingRoutes(router);

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = createServer((req, res) => router.handle(req, res));

// ---------------------------------------------------------------------------
// WebSocket server – real-time events, audio level, and video frames
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ server });

/** Broadcast a JSON message to all connected WS clients. */
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(data, { binary: false });
    }
  }
}

/** Broadcast a binary frame (video JPEG) to subscribed clients. */
function broadcastBinary(type, buf) {
  // Prefix: 1-byte type tag (0x01 = video frame)
  const tagged = Buffer.allocUnsafe(1 + buf.length);
  tagged[0] = type;
  buf.copy(tagged, 1);
  for (const client of wss.clients) {
    if (client.readyState === 1 && client._subscriptions?.has('video')) {
      client.send(tagged, { binary: true });
    }
  }
}

wss.on('connection', (ws) => {
  ws._subscriptions = new Set(['events', 'level']);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'subscribe')   ws._subscriptions.add(msg.channel);
      if (msg.type === 'unsubscribe') ws._subscriptions.delete(msg.channel);
    } catch { /* ignore bad messages */ }
  });
});

// ---------------------------------------------------------------------------
// A/V capture pipelines
// ---------------------------------------------------------------------------

const audioCapture = new AudioCapture(config);
const videoCapture = new VideoCapture(config);
const recorder     = new ContinuousRecorder(config);

// Audio level → WS
audioCapture.on('level', ({ rms, peak }) => {
  broadcast({ type: 'level', rms, peak });
});

// Bark event → DB + notification + WS push
audioCapture.on('bark', async (event) => {
  console.log(
    `[bark] probability=${event.probability.toFixed(2)} duration=${event.duration.toFixed(2)}s`
  );

  const id = createEvent(event);

  // Push to connected clients
  broadcast({ type: 'bark', event: { ...event, id } });

  // Notify (respects cooldown and threshold)
  await maybeNotify(event);
});

audioCapture.on('error', (err) => {
  console.warn('[audio] error:', err.message);
});

// Video frames → WS (binary)
videoCapture.on('frame', (jpegBuf) => {
  broadcastBinary(0x01, jpegBuf);
});

videoCapture.on('error', (err) => {
  console.warn('[video] error:', err.message);
});

recorder.on('error', (err) => {
  console.warn('[recorder] error:', err.message);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const port = config.server?.port || 3000;
const host = config.server?.host || '0.0.0.0';

server.listen(port, host, () => {
  console.log(`good-dog running at http://${host}:${port}`);

  if (config.recording.audioEnabled !== false) audioCapture.start();
  if (config.recording.videoEnabled)           videoCapture.start();
  recorder.start();
});

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

function shutdown() {
  console.log('\nShutting down…');
  audioCapture.stop();
  videoCapture.stop();
  recorder.stop();

  // Terminate all WebSocket connections so server.close() can complete.
  for (const client of wss.clients) client.terminate();
  wss.close();

  server.close(() => process.exit(0));

  // Force-exit after 5 s if something is still hanging.
  setTimeout(() => process.exit(1), 5000).unref();
}

// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.wav':  'audio/wav',
  '.mp4':  'video/mp4',
  '.json': 'application/json',
};
