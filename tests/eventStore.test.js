'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const EventStore = require('../src/eventStore');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'good-dog-store-'));
}

function makeStore(dir) {
  return new EventStore({
    metaFile:  path.join(dir, 'events.json'),
    eventsDir: dir,
  });
}

describe('EventStore', () => {
  let tmpDir;
  let store;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    store  = makeStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── addEvent ─────────────────────────────────────────────────────────────

  describe('addEvent()', () => {
    it('stores an event in memory', () => {
      store.addEvent({ id: '1', timestamp: '2026-01-01T00:00:00Z', probability: 0.9 });
      const events = store.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('1');
    });

    it('persists events to disk', () => {
      store.addEvent({ id: '2', timestamp: '2026-01-01T01:00:00Z', probability: 0.8 });
      const raw = fs.readFileSync(path.join(tmpDir, 'events.json'), 'utf8');
      const parsed = JSON.parse(raw);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('2');
    });

    it('stores optional audioFile and duration fields', () => {
      store.addEvent({
        id: '3',
        timestamp: '2026-01-01T02:00:00Z',
        probability: 0.75,
        audioFile: '/path/to/clip.wav',
        duration: 3,
      });
      const evt = store.getEventById('3');
      expect(evt.audioFile).toBe('/path/to/clip.wav');
      expect(evt.duration).toBe(3);
    });

    it('defaults audioFile and duration to null when not provided', () => {
      store.addEvent({ id: '4', timestamp: '2026-01-01T03:00:00Z', probability: 0.85 });
      const evt = store.getEventById('4');
      expect(evt.audioFile).toBeNull();
      expect(evt.duration).toBeNull();
    });

    it('accumulates multiple events', () => {
      store.addEvent({ id: 'a', timestamp: '2026-01-01T00:00:00Z', probability: 0.9 });
      store.addEvent({ id: 'b', timestamp: '2026-01-01T00:01:00Z', probability: 0.8 });
      store.addEvent({ id: 'c', timestamp: '2026-01-01T00:02:00Z', probability: 0.7 });
      expect(store.getEvents()).toHaveLength(3);
    });
  });

  // ── getEventById ─────────────────────────────────────────────────────────

  describe('getEventById()', () => {
    it('returns the correct event', () => {
      store.addEvent({ id: 'x', timestamp: '2026-01-01T00:00:00Z', probability: 0.9 });
      store.addEvent({ id: 'y', timestamp: '2026-01-01T00:01:00Z', probability: 0.8 });
      expect(store.getEventById('x').id).toBe('x');
      expect(store.getEventById('y').id).toBe('y');
    });

    it('returns undefined for an unknown id', () => {
      expect(store.getEventById('missing')).toBeUndefined();
    });
  });

  // ── getEvents with filter ─────────────────────────────────────────────────

  describe('getEvents() with filters', () => {
    beforeEach(() => {
      store.addEvent({ id: '1', timestamp: '2026-01-01T00:00:00Z', probability: 0.9 });
      store.addEvent({ id: '2', timestamp: '2026-01-01T06:00:00Z', probability: 0.8 });
      store.addEvent({ id: '3', timestamp: '2026-01-01T12:00:00Z', probability: 0.7 });
    });

    it('returns all events when no filter is given', () => {
      expect(store.getEvents()).toHaveLength(3);
    });

    it('filters by from date (inclusive)', () => {
      const results = store.getEvents({ from: '2026-01-01T06:00:00Z' });
      expect(results.map((e) => e.id)).toEqual(['2', '3']);
    });

    it('filters by to date (inclusive)', () => {
      const results = store.getEvents({ to: '2026-01-01T06:00:00Z' });
      expect(results.map((e) => e.id)).toEqual(['1', '2']);
    });

    it('filters by both from and to', () => {
      const results = store.getEvents({
        from: '2026-01-01T01:00:00Z',
        to:   '2026-01-01T11:00:00Z',
      });
      expect(results.map((e) => e.id)).toEqual(['2']);
    });
  });

  // ── persistence (load) ────────────────────────────────────────────────────

  describe('load()', () => {
    it('re-loads events from disk after re-instantiation', () => {
      store.addEvent({ id: 'p', timestamp: '2026-01-01T00:00:00Z', probability: 0.9 });

      const store2 = makeStore(tmpDir);
      const events = store2.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('p');
    });

    it('handles a missing file gracefully', () => {
      const emptyStore = makeStore(makeTmpDir());
      expect(emptyStore.getEvents()).toEqual([]);
    });

    it('handles a corrupt JSON file gracefully', () => {
      const metaFile = path.join(tmpDir, 'corrupt.json');
      fs.writeFileSync(metaFile, '{not valid json}', 'utf8');
      const corrupt = new EventStore({ metaFile, eventsDir: tmpDir });
      expect(corrupt.getEvents()).toEqual([]);
    });
  });

  // ── clear ─────────────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('removes all events from memory and disk', () => {
      store.addEvent({ id: '1', timestamp: '2026-01-01T00:00:00Z', probability: 0.9 });
      store.clear();
      expect(store.getEvents()).toEqual([]);
      const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'events.json'), 'utf8'));
      expect(raw).toEqual([]);
    });
  });
});
