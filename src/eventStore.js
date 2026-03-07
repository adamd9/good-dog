/**
 * EventStore — persists and queries bark detection events.
 *
 * Events are stored in a JSON file on disk. In-memory access is O(1) lookup
 * by id and supports range queries by timestamp.
 */
'use strict';

const fs = require('fs');
const path = require('path');

class EventStore {
  /**
   * @param {object} options
   * @param {string}  options.metaFile   Path to the events JSON file.
   * @param {string}  options.eventsDir  Directory where event WAV clips live.
   */
  constructor(options = {}) {
    this.metaFile = options.metaFile;
    this.eventsDir = options.eventsDir || path.dirname(options.metaFile);
    this._events = [];
    this._loaded = false;
  }

  /**
   * Load persisted events from disk (idempotent).
   * Safe to call even if the file does not exist yet.
   */
  load() {
    if (this._loaded) return;
    this._loaded = true;
    if (fs.existsSync(this.metaFile)) {
      try {
        const raw = fs.readFileSync(this.metaFile, 'utf8');
        this._events = JSON.parse(raw);
      } catch (_) {
        this._events = [];
      }
    }
  }

  /**
   * Add a detection event and immediately persist.
   *
   * @param {object} event
   * @param {string} event.id          Unique identifier (e.g. uuid).
   * @param {string} event.timestamp   ISO 8601 string.
   * @param {number} event.probability 0–1.
   * @param {string} [event.audioFile] Relative path to the WAV clip.
   * @param {number} [event.duration]  Duration of the clip in seconds.
   * @returns {object} The stored event object.
   */
  addEvent(event) {
    this.load();
    const stored = {
      id: event.id,
      timestamp: event.timestamp,
      probability: event.probability,
      audioFile: event.audioFile || null,
      duration: event.duration || null,
    };
    this._events.push(stored);
    this._persist();
    return stored;
  }

  /**
   * Retrieve all stored events, optionally filtered by a time range.
   *
   * @param {object}  [filter]
   * @param {string|Date} [filter.from]  Inclusive start (ISO string or Date).
   * @param {string|Date} [filter.to]    Inclusive end   (ISO string or Date).
   * @returns {Array<object>}
   */
  getEvents(filter = {}) {
    this.load();
    let events = this._events.slice();

    if (filter.from) {
      const from = new Date(filter.from).getTime();
      events = events.filter((e) => new Date(e.timestamp).getTime() >= from);
    }
    if (filter.to) {
      const to = new Date(filter.to).getTime();
      events = events.filter((e) => new Date(e.timestamp).getTime() <= to);
    }

    return events;
  }

  /**
   * Retrieve a single event by id.
   * @param {string} id
   * @returns {object|undefined}
   */
  getEventById(id) {
    this.load();
    return this._events.find((e) => e.id === id);
  }

  /**
   * Remove all events from memory and disk. Useful for testing.
   */
  clear() {
    this._events = [];
    this._loaded = true;
    this._persist();
  }

  // ─── private ─────────────────────────────────────────────────────────────

  _persist() {
    fs.mkdirSync(path.dirname(this.metaFile), { recursive: true });
    fs.writeFileSync(this.metaFile, JSON.stringify(this._events, null, 2), 'utf8');
  }
}

module.exports = EventStore;
