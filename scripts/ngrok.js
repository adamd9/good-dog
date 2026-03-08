#!/usr/bin/env node
/**
 * scripts/ngrok.js – Expose the good-dog UI over the internet via ngrok.
 *
 * Run AFTER the server is already running:
 *   npm run ngrok
 *
 * The port is read from data/config.json if present, otherwise defaults to 3000.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'data', 'config.json');

let port = 3000;
if (existsSync(CONFIG_PATH)) {
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    port = cfg?.server?.port ?? port;
  } catch { /* use default */ }
}

console.log(`[ngrok] Exposing http://localhost:${port} …`);

const proc = spawn('ngrok', ['http', String(port)], { stdio: 'inherit' });

proc.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error('[ngrok] ngrok not found. Install it from https://ngrok.com/download');
  } else {
    console.error('[ngrok] error:', err.message);
  }
  process.exit(1);
});

proc.on('exit', (code) => process.exit(code ?? 0));

// Forward signals so Ctrl-C cleanly kills ngrok
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => proc.kill(sig));
}
