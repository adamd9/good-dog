/**
 * db.js – SQLite database initialisation using the built-in node:sqlite module.
 * Creates the tables for events and recordings if they do not already exist.
 */

import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

let _db = null;

export function getDb(dbPath) {
  if (_db) return _db;
  const resolvedPath = dbPath || join(DATA_DIR, 'good-dog.db');
  if (resolvedPath !== ':memory:') {
    mkdirSync(join(resolvedPath, '..'), { recursive: true });
  }
  _db = new DatabaseSync(resolvedPath);
  initSchema(_db);
  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** Allow tests to reset the singleton to a fresh in-memory database. */
export function resetDb() {
  if (_db) { try { _db.close(); } catch { /* ignore */ } }
  _db = new DatabaseSync(':memory:');
  initSchema(_db);
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id          TEXT PRIMARY KEY,
      timestamp   INTEGER NOT NULL,
      probability REAL    NOT NULL,
      duration    REAL    NOT NULL,
      audioFile   TEXT    NOT NULL,
      videoFile   TEXT,
      reviewed    INTEGER NOT NULL DEFAULT 0,
      notes       TEXT    DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

    CREATE TABLE IF NOT EXISTS recordings (
      id          TEXT PRIMARY KEY,
      startTime   INTEGER NOT NULL,
      endTime     INTEGER,
      audioFile   TEXT,
      videoFile   TEXT,
      sizeBytes   INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_recordings_startTime ON recordings(startTime);
  `);
}
