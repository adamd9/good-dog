/**
 * api/recordingRoutes.js – List and stream continuous recording segments.
 */

import { createReadStream, statSync, existsSync } from 'node:fs';
import { listRecordings } from '../eventStore.js';
import { sendJson, parseQuery } from '../router.js';

export function registerRecordingRoutes(router) {
  // List segments (newest first)
  router.get('/api/recordings', (req, res) => {
    const q = parseQuery(req);
    const recordings = listRecordings({
      since: q.since ? Number(q.since) : Date.now() - 86400 * 1000,
      until: q.until ? Number(q.until) : undefined,
    });
    sendJson(res, 200, recordings);
  });

  // Stream audio for a segment
  router.get('/api/recordings/:id/audio', (req, res) => {
    const rows = listRecordings();
    const row  = rows.find((r) => r.id === req.params.id);
    if (!row) return sendJson(res, 404, { error: 'Not found' });
    _streamFile(res, row.audioFile, 'audio/wav');
  });

  // Stream video for a segment
  router.get('/api/recordings/:id/video', (req, res) => {
    const rows = listRecordings();
    const row  = rows.find((r) => r.id === req.params.id);
    if (!row || !row.videoFile) return sendJson(res, 404, { error: 'Not found' });
    _streamFile(res, row.videoFile, 'video/mp4');
  });
}

// ---------------------------------------------------------------------------

function _streamFile(res, filePath, contentType) {
  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
    return;
  }

  let size;
  try { size = statSync(filePath).size; } catch {
    res.writeHead(500); res.end(); return;
  }

  res.writeHead(200, {
    'Content-Type':   contentType,
    'Content-Length': size,
    'Accept-Ranges':  'bytes',
  });
  createReadStream(filePath).pipe(res);
}
