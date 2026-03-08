/**
 * api/recordingRoutes.js – List and stream continuous recording segments.
 */

import { createReadStream, statSync, existsSync } from 'node:fs';
import { listRecordings, listEvents } from '../eventStore.js';
import { sendJson, parseQuery } from '../router.js';

export function registerRecordingRoutes(router) {
  // Timeline: merged recordings + events for a configurable window (default 24 h).
  // Returns { windowStart, windowEnd, recordings, events }
  router.get('/api/timeline', (req, res) => {
    const q          = parseQuery(req);
    const windowSecs = Math.min(Number(q.window) || 86400, 86400);
    const windowEnd  = Date.now();
    const windowStart = windowEnd - windowSecs * 1000;
    const recordings  = listRecordings({ since: windowStart });
    const events      = listEvents({ since: windowStart, limit: 500 });
    sendJson(res, 200, { windowStart, windowEnd, recordings, events });
  });

  // List segments (newest first)
  router.get('/api/recordings', (req, res) => {
    const q = parseQuery(req);
    const recordings = listRecordings({
      since: q.since ? Number(q.since) : Date.now() - 86400 * 1000,
      until: q.until ? Number(q.until) : undefined,
    });
    sendJson(res, 200, recordings);
  });

  // Stream audio for a segment (supports Range for seeking).
  // Falls back to the combined mp4 when audioFile is null (both-AV recording).
  router.get('/api/recordings/:id/audio', (req, res) => {
    const rows = listRecordings();
    const row  = rows.find((r) => r.id === req.params.id);
    if (!row) return sendJson(res, 404, { error: 'Not found' });
    const file = row.audioFile || row.videoFile;
    const mime = row.audioFile ? 'audio/wav' : 'video/mp4';
    _streamFile(res, req, file, mime);
  });

  // Stream video for a segment (supports Range for seeking)
  router.get('/api/recordings/:id/video', (req, res) => {
    const rows = listRecordings();
    const row  = rows.find((r) => r.id === req.params.id);
    if (!row || !row.videoFile) return sendJson(res, 404, { error: 'Not found' });
    _streamFile(res, req, row.videoFile, 'video/mp4');
  });
}

// ---------------------------------------------------------------------------

function _streamFile(res, req, filePath, contentType) {
  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
    return;
  }

  let size;
  try { size = statSync(filePath).size; } catch {
    res.writeHead(500); res.end(); return;
  }

  const range = req.headers && req.headers.range;

  if (range) {
    const [, s, e] = range.match(/bytes=(\d*)-(\d*)/) || [];
    const start = s ? parseInt(s, 10) : 0;
    const end   = e ? parseInt(e, 10) : size - 1;

    if (start >= size || end >= size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      res.end();
      return;
    }

    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${size}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': end - start + 1,
      'Content-Type':   contentType,
    });
    createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Type':   contentType,
      'Content-Length': size,
      'Accept-Ranges':  'bytes',
    });
    createReadStream(filePath).pipe(res);
  }
}
