/**
 * tests/eventStore.test.js
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';

const TMP_DIR = join('/tmp', 'good-dog-test-' + process.pid);

import { resetDb } from '../src/db.js';

import {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
  upsertRecording,
  listRecordings,
  deleteRecording,
} from '../src/eventStore.js';

beforeEach(() => {
  resetDb();
});

afterAll(() => {
  resetDb();
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------

describe('createEvent / getEvent', () => {
  test('creates an event and retrieves it by id', () => {
    const id = createEvent({
      timestamp:   Date.now(),
      probability: 0.87,
      duration:    0.42,
      audioFile:   '/tmp/test.wav',
    });

    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const ev = getEvent(id);
    expect(ev).not.toBeNull();
    expect(ev.id).toBe(id);
    expect(ev.probability).toBeCloseTo(0.87);
    expect(ev.duration).toBeCloseTo(0.42);
    expect(ev.audioFile).toBe('/tmp/test.wav');
    expect(ev.reviewed).toBe(0);
  });

  test('getEvent returns null for unknown id', () => {
    resetDb();
    const ev = getEvent('nonexistent-id');
    expect(ev).toBeNull();
  });
});

describe('listEvents', () => {
  test('returns events newest first', () => {
    resetDb();
    const now = Date.now();
    createEvent({ timestamp: now - 2000, probability: 0.6, duration: 0.3, audioFile: '/a' });
    createEvent({ timestamp: now - 1000, probability: 0.7, duration: 0.4, audioFile: '/b' });
    createEvent({ timestamp: now,        probability: 0.8, duration: 0.5, audioFile: '/c' });

    const events = listEvents();
    expect(events.length).toBe(3);
    expect(events[0].probability).toBeCloseTo(0.8);
    expect(events[2].probability).toBeCloseTo(0.6);
  });

  test('limit and offset work', () => {
    resetDb();
    for (let i = 0; i < 10; i++) {
      createEvent({ timestamp: Date.now() + i, probability: 0.5, duration: 0.2, audioFile: '/x' });
    }
    const page1 = listEvents({ limit: 4, offset: 0 });
    const page2 = listEvents({ limit: 4, offset: 4 });
    expect(page1.length).toBe(4);
    expect(page2.length).toBe(4);
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  test('since filter excludes old events', () => {
    resetDb();
    const now = Date.now();
    createEvent({ timestamp: now - 5000, probability: 0.5, duration: 0.2, audioFile: '/old' });
    createEvent({ timestamp: now,        probability: 0.9, duration: 0.3, audioFile: '/new' });

    const events = listEvents({ since: now - 1000 });
    expect(events.length).toBe(1);
    expect(events[0].audioFile).toBe('/new');
  });
});

describe('updateEvent', () => {
  test('marks event as reviewed', () => {
    resetDb();
    const id = createEvent({ timestamp: Date.now(), probability: 0.7, duration: 0.3, audioFile: '/f' });
    updateEvent(id, { reviewed: true });
    const ev = getEvent(id);
    expect(ev.reviewed).toBe(1);
  });

  test('saves notes', () => {
    resetDb();
    const id = createEvent({ timestamp: Date.now(), probability: 0.7, duration: 0.3, audioFile: '/f' });
    updateEvent(id, { notes: 'test note' });
    const ev = getEvent(id);
    expect(ev.notes).toBe('test note');
  });

  test('returns false for unknown id', () => {
    resetDb();
    const result = updateEvent('bad-id', { reviewed: true });
    expect(result).toBe(false);
  });
});

describe('deleteEvent', () => {
  test('deletes an existing event', () => {
    resetDb();
    const id = createEvent({ timestamp: Date.now(), probability: 0.6, duration: 0.2, audioFile: '/g' });
    expect(deleteEvent(id)).toBe(true);
    expect(getEvent(id)).toBeNull();
  });

  test('returns false for unknown id', () => {
    resetDb();
    expect(deleteEvent('bad-id')).toBe(false);
  });
});

describe('recordings', () => {
  test('upsertRecording and listRecordings', () => {
    resetDb();
    const now = Date.now();
    upsertRecording({
      id:        'rec-1',
      startTime: now - 3000,
      endTime:   now - 1000,
      audioFile: '/tmp/seg1.wav',
      sizeBytes: 12345,
    });

    const recs = listRecordings();
    expect(recs.length).toBe(1);
    expect(recs[0].id).toBe('rec-1');
    expect(recs[0].sizeBytes).toBe(12345);
  });

  test('upsert updates existing recording', () => {
    resetDb();
    const now = Date.now();
    upsertRecording({ id: 'r', startTime: now, audioFile: '/a', sizeBytes: 0 });
    upsertRecording({ id: 'r', startTime: now, endTime: now + 1000, audioFile: '/a', sizeBytes: 999 });

    const recs = listRecordings();
    expect(recs.length).toBe(1);
    expect(recs[0].sizeBytes).toBe(999);
    expect(recs[0].endTime).toBe(now + 1000);
  });

  test('deleteRecording removes row', () => {
    resetDb();
    upsertRecording({ id: 'del-me', startTime: Date.now(), audioFile: '/x', sizeBytes: 0 });
    deleteRecording('del-me');
    expect(listRecordings()).toHaveLength(0);
  });
});
