/**
 * config.js – JSON-based configuration management.
 * Reads and writes a config.json file in the data directory.
 * Merges with sensible defaults so the app works out of the box.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const CONFIG_PATH = join(DATA_DIR, 'config.json');

export const DEFAULTS = {
  detection: {
    threshold: 0.55,      // probability threshold to trigger a bark event (0–1)
    minDuration: 0.15,    // minimum bark duration in seconds
    beforeBuffer: 5,      // seconds of audio to keep before the bark
    afterBuffer: 10,      // seconds of audio to keep after the bark
  },
  recording: {
    segmentDuration: 300, // seconds per continuous recording segment (5 min)
    maxAgeSecs: 86400,    // maximum age for recordings (24 h)
    videoDevice: 'default',
    audioDevice: 'default',
    videoEnabled: true,
    audioEnabled: true,
    frameRate: 15,
    resolution: '640x480',
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  notification: {
    enabled: false,
    type: 'webhook',       // 'webhook' | 'email' | 'mqtt'
    endpoint: '',          // webhook URL / email address / MQTT broker
    minProbability: 0.7,  // only notify above this threshold
    cooldownSecs: 30,      // minimum seconds between notifications
  },
};

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return structuredClone(DEFAULTS);
  }
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const saved = JSON.parse(raw);
    return mergeDeep(structuredClone(DEFAULTS), saved);
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveConfig(config) {
  validateConfig(config);
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function validateConfig(config) {
  const d = config.detection;
  if (d) {
    if (d.threshold !== undefined && (d.threshold < 0 || d.threshold > 1)) {
      throw new Error('detection.threshold must be between 0 and 1');
    }
    if (d.minDuration !== undefined && d.minDuration < 0) {
      throw new Error('detection.minDuration must be >= 0');
    }
    if (d.beforeBuffer !== undefined && d.beforeBuffer < 0) {
      throw new Error('detection.beforeBuffer must be >= 0');
    }
    if (d.afterBuffer !== undefined && d.afterBuffer < 0) {
      throw new Error('detection.afterBuffer must be >= 0');
    }
  }

  const s = config.server;
  if (s) {
    if (s.port !== undefined && (s.port < 1 || s.port > 65535)) {
      throw new Error('server.port must be between 1 and 65535');
    }
  }

  const n = config.notification;
  if (n) {
    const validTypes = ['webhook', 'email', 'mqtt'];
    if (n.type !== undefined && !validTypes.includes(n.type)) {
      throw new Error(`notification.type must be one of: ${validTypes.join(', ')}`);
    }
  }
}

function mergeDeep(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] !== null &&
      typeof target[key] === 'object'
    ) {
      mergeDeep(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
