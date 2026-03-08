/**
 * api/eventRoutes.js – CRUD for bark events plus audio/video file serving.
 */

import { createReadStream, statSync, existsSync } from 'node:fs';
import {
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
} from '../eventStore.js';
import { sendJson, readBody, parseQuery } from '../router.js';

export function registerEventRoutes(router) {
  // List events
  router.get('/api/events', (req, res) => {
    const q = parseQuery(req);
    const events = listEvents({
      limit:        Math.min(Number(q.limit)  || 50, 200),
      offset:       Number(q.offset)          || 0,
      reviewedOnly: q.reviewed === 'true',
      since:        q.since ? Number(q.since) : undefined,
    });
    sendJson(res, 200, events);
  });

  // Get single event
  router.get('/api/events/:id', (req, res) => {
    const event = getEvent(req.params.id);
    if (!event) return sendJson(res, 404, { error: 'Not found' });
    sendJson(res, 200, event);
  });

  // Update event (reviewed, notes)
  router.patch('/api/events/:id', async (req, res) => {
    let body;
    try { body = await readBody(req); }
    catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }

    const updated = updateEvent(req.params.id, body);
    if (!updated) return sendJson(res, 404, { error: 'Not found' });
    sendJson(res, 200, getEvent(req.params.id));
  });

  // Delete event
  router.delete('/api/events/:id', (req, res) => {
    const deleted = deleteEvent(req.params.id);
    if (!deleted) return sendJson(res, 404, { error: 'Not found' });
    sendJson(res, 204, null);
  });

  // Stream the event audio file
  router.get('/api/events/:id/audio', (req, res) => {
    const event = getEvent(req.params.id);
    if (!event) return sendJson(res, 404, { error: 'Not found' });
    _streamFile(res, event.audioFile, 'audio/wav');
  });

  // Stream the event video file (if present)
  router.get('/api/events/:id/video', (req, res) => {
    const event = getEvent(req.params.id);
    if (!event || !event.videoFile) return sendJson(res, 404, { error: 'Not found' });
    _streamFile(res, event.videoFile, 'video/mp4');
  });
}

// ---------------------------------------------------------------------------

function _streamFile(res, filePath, contentType) {
  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
    return;
  }

  let size;
  try { size = statSync(filePath).size; } catch {
    res.writeHead(500);
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type':   contentType,
    'Content-Length': size,
    'Accept-Ranges':  'bytes',
  });
  createReadStream(filePath).pipe(res);
}
