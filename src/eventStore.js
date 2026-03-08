/**
 * eventStore.js – CRUD operations for bark events stored in SQLite.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';

/**
 * Persist a new bark event.
 *
 * @param {object} event
 * @param {number} event.timestamp   Unix ms
 * @param {number} event.probability 0–1
 * @param {number} event.duration    seconds
 * @param {string} event.audioFile   path to WAV clip
 * @param {string} [event.videoFile] path to video clip (optional)
 * @returns {string} The generated event id
 */
export function createEvent(event) {
  const db = getDb();
  const id = randomUUID();
  const stmt = db.prepare(
    `INSERT INTO events (id, timestamp, probability, duration, audioFile, videoFile)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    id,
    event.timestamp,
    event.probability,
    event.duration,
    event.audioFile,
    event.videoFile || null
  );
  return id;
}

/**
 * Retrieve events, newest first.
 *
 * @param {object} [options]
 * @param {number} [options.limit=50]
 * @param {number} [options.offset=0]
 * @param {boolean} [options.reviewedOnly=false]
 * @param {number} [options.since]  Unix ms – only events after this time
 * @returns {object[]}
 */
export function listEvents({ limit = 50, offset = 0, reviewedOnly = false, since } = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (reviewedOnly) {
    conditions.push('reviewed = 1');
  }
  if (since != null) {
    conditions.push('timestamp > ?');
    params.push(since);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = db.prepare(
    `SELECT * FROM events ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
  );
  return stmt.all(...params, limit, offset);
}

/**
 * Retrieve a single event by id.
 * @param {string} id
 * @returns {object|null}
 */
export function getEvent(id) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM events WHERE id = ?');
  return stmt.get(id) ?? null;
}

/**
 * Update the reviewed flag and/or notes for an event.
 * @param {string} id
 * @param {object} updates  { reviewed?, notes? }
 * @returns {boolean} true if a row was updated
 */
export function updateEvent(id, updates) {
  const db = getDb();
  const fields = [];
  const values = [];

  if (updates.reviewed !== undefined) {
    fields.push('reviewed = ?');
    values.push(updates.reviewed ? 1 : 0);
  }
  if (updates.notes !== undefined) {
    fields.push('notes = ?');
    values.push(updates.notes);
  }

  if (fields.length === 0) return false;

  values.push(id);
  const stmt = db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

/**
 * Delete an event record (does NOT delete the audio/video files).
 * @param {string} id
 * @returns {boolean}
 */
export function deleteEvent(id) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM events WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * Upsert a recording segment entry.
 * @param {object} rec
 */
export function upsertRecording(rec) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO recordings (id, startTime, endTime, audioFile, videoFile, sizeBytes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       endTime   = excluded.endTime,
       sizeBytes = excluded.sizeBytes`
  );
  stmt.run(
    rec.id,
    rec.startTime,
    rec.endTime || null,
    rec.audioFile,
    rec.videoFile || null,
    rec.sizeBytes || 0
  );
}

/**
 * List recording segments, newest first.
 * @param {object} [options]
 * @param {number} [options.since]  Unix ms
 * @param {number} [options.until]  Unix ms
 * @returns {object[]}
 */
export function listRecordings({ since, until } = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (since != null) {
    conditions.push('startTime >= ?');
    params.push(since);
  }
  if (until != null) {
    conditions.push('startTime <= ?');
    params.push(until);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = db.prepare(
    `SELECT * FROM recordings ${where} ORDER BY startTime DESC`
  );
  return stmt.all(...params);
}

/**
 * Delete a recording row by id.
 * @param {string} id
 */
export function deleteRecording(id) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM recordings WHERE id = ?');
  stmt.run(id);
}
