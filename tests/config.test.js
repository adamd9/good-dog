/**
 * tests/config.test.js
 */

import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TMP_DIR = join('/tmp', 'good-dog-config-test-' + process.pid);
mkdirSync(TMP_DIR, { recursive: true });

// We need to patch the CONFIG_PATH – do this by writing a config.json
// in the data dir of a tmp location and calling functions directly.
import { loadConfig, saveConfig, validateConfig, DEFAULTS } from '../src/config.js';

afterAll(() => {
  try { rmSync(TMP_DIR, { recursive: true }); } catch { /* ignore */ }
});

describe('DEFAULTS', () => {
  test('has required top-level keys', () => {
    expect(DEFAULTS).toHaveProperty('detection');
    expect(DEFAULTS).toHaveProperty('recording');
    expect(DEFAULTS).toHaveProperty('server');
    expect(DEFAULTS).toHaveProperty('notification');
  });

  test('detection defaults are sensible', () => {
    expect(DEFAULTS.detection.threshold).toBeGreaterThan(0);
    expect(DEFAULTS.detection.threshold).toBeLessThanOrEqual(1);
    expect(DEFAULTS.detection.beforeBuffer).toBeGreaterThan(0);
    expect(DEFAULTS.detection.afterBuffer).toBeGreaterThan(0);
  });
});

describe('validateConfig', () => {
  test('accepts valid config', () => {
    expect(() => validateConfig({
      detection:    { threshold: 0.7, minDuration: 0.2, beforeBuffer: 5, afterBuffer: 10 },
      server:       { port: 3000 },
      notification: { type: 'webhook' },
    })).not.toThrow();
  });

  test('rejects threshold out of range', () => {
    expect(() => validateConfig({ detection: { threshold: 1.5 } })).toThrow(/threshold/);
    expect(() => validateConfig({ detection: { threshold: -0.1 } })).toThrow(/threshold/);
  });

  test('rejects negative minDuration', () => {
    expect(() => validateConfig({ detection: { minDuration: -1 } })).toThrow(/minDuration/);
  });

  test('rejects negative buffer values', () => {
    expect(() => validateConfig({ detection: { beforeBuffer: -5 } })).toThrow(/beforeBuffer/);
    expect(() => validateConfig({ detection: { afterBuffer: -1 } })).toThrow(/afterBuffer/);
  });

  test('rejects invalid port', () => {
    expect(() => validateConfig({ server: { port: 0 } })).toThrow(/port/);
    expect(() => validateConfig({ server: { port: 99999 } })).toThrow(/port/);
  });

  test('rejects unknown notification type', () => {
    expect(() => validateConfig({ notification: { type: 'sms' } })).toThrow(/notification.type/);
  });

  test('accepts all valid notification types', () => {
    for (const type of ['webhook', 'email', 'mqtt']) {
      expect(() => validateConfig({ notification: { type } })).not.toThrow();
    }
  });

  test('does not throw for empty config', () => {
    expect(() => validateConfig({})).not.toThrow();
  });
});

describe('loadConfig', () => {
  test('returns defaults when no config file exists', () => {
    const cfg = loadConfig();
    expect(cfg.detection.threshold).toBe(DEFAULTS.detection.threshold);
    expect(cfg.server.port).toBe(DEFAULTS.server.port);
  });

  test('merges saved values with defaults', () => {
    // loadConfig reads from the real data/config.json path – we test
    // the merge behaviour by calling saveConfig then loadConfig
    const original = loadConfig();
    const modified = {
      ...original,
      detection: { ...original.detection, threshold: 0.99 },
    };
    saveConfig(modified);
    const reloaded = loadConfig();
    expect(reloaded.detection.threshold).toBeCloseTo(0.99);
    // Other defaults should still be present
    expect(reloaded.server.port).toBe(DEFAULTS.server.port);

    // Restore
    saveConfig({ ...reloaded, detection: { ...reloaded.detection, threshold: DEFAULTS.detection.threshold } });
  });
});
