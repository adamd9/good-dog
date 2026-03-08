/**
 * deviceEnumerator.js – Enumerate available audio and video capture devices.
 *
 * Uses ffmpeg (avfoundation / dshow) on macOS / Windows for a unified list.
 * Falls back to filesystem + PulseAudio / ALSA on Linux.
 *
 * Returns: { video: [{ id, name }], audio: [{ id, name }] }
 * The first entry in each array is always { id: 'default', name: 'Default' }.
 */

import { spawn, execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { ffmpegPath } from './ffmpegResolver.js';

export async function enumerateDevices() {
  const platform = process.platform;
  if (platform === 'darwin') return _enumerateMacOS();
  if (platform === 'win32')  return _enumerateWindows();
  return _enumerateLinux();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Spawn ffmpeg with the given args and collect all stderr output. */
function _ffmpegStderr(args) {
  return new Promise((resolve) => {
    let out = '';
    let timer;

    const proc = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    proc.stderr.on('data', (d) => { out += d.toString(); });

    const done = () => { clearTimeout(timer); resolve(out); };
    proc.on('close', done);
    proc.on('error', done);

    // ffmpeg exits non-zero when listing devices – kill after 5 s if stuck
    timer = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
      resolve(out);
    }, 5000);
  });
}

// ---------------------------------------------------------------------------
// macOS – AVFoundation
// ---------------------------------------------------------------------------

async function _enumerateMacOS() {
  const out = await _ffmpegStderr([
    '-f', 'avfoundation', '-list_devices', 'true', '-i', '',
  ]);

  const video = [{ id: 'default', name: 'Default' }];
  const audio = [{ id: 'default', name: 'Default' }];
  let section = null;

  for (const line of out.split('\n')) {
    if (line.includes('AVFoundation video devices')) { section = 'video'; continue; }
    if (line.includes('AVFoundation audio devices')) { section = 'audio'; continue; }

    // Matches:  [AVFoundation indev @ 0x…] [0] FaceTime HD Camera
    const m = line.match(/\[(\d+)\]\s+(.+)/);
    if (m && section) {
      (section === 'video' ? video : audio).push({
        id:   m[1],
        name: m[2].trim(),
      });
    }
  }

  return { video, audio };
}

// ---------------------------------------------------------------------------
// Windows – DirectShow
// ---------------------------------------------------------------------------

async function _enumerateWindows() {
  const out = await _ffmpegStderr([
    '-f', 'dshow', '-list_devices', 'true', '-i', '',
  ]);

  const video = [{ id: 'default', name: 'Default' }];
  const audio = [{ id: 'default', name: 'Default' }];
  let section = null;

  for (const line of out.split('\n')) {
    if (line.includes('DirectShow video devices')) { section = 'video'; continue; }
    if (line.includes('DirectShow audio devices')) { section = 'audio'; continue; }

    // dshow lines: `  "Integrated Camera"`
    const m = line.match(/"([^"]+)"/);
    if (m && section) {
      const name = m[1].trim();
      (section === 'video' ? video : audio).push({ id: name, name });
    }
  }

  return { video, audio };
}

// ---------------------------------------------------------------------------
// Linux – v4l2 (video) + PulseAudio / ALSA (audio)
// ---------------------------------------------------------------------------

async function _enumerateLinux() {
  const video = [{ id: 'default', name: 'Default' }];
  const audio = [{ id: 'default', name: 'Default' }];

  // Video: /dev/video* nodes
  try {
    const devices = readdirSync('/dev')
      .filter((d) => /^video\d+$/.test(d))
      .sort();
    for (const d of devices) {
      video.push({ id: `/dev/${d}`, name: `/dev/${d}` });
    }
  } catch { /* no v4l2 devices or /dev not readable */ }

  // Audio: PulseAudio first, then ALSA
  try {
    const out = execFileSync('pactl', ['list', 'short', 'sources'], {
      timeout: 3000, encoding: 'utf-8',
    });
    for (const line of out.split('\n')) {
      const parts = line.trim().split('\t');
      if (parts.length >= 2 && parts[1]) {
        audio.push({ id: parts[1], name: parts[1] });
      }
    }
  } catch {
    try {
      const out = execFileSync('arecord', ['-l'], {
        timeout: 3000, encoding: 'utf-8',
      });
      for (const line of out.split('\n')) {
        const m = line.match(/card (\d+): [^[]+\[([^\]]+)\].*device (\d+)/);
        if (m) {
          const id = `hw:${m[1]},${m[3]}`;
          audio.push({ id, name: `${m[2]} (${id})` });
        }
      }
    } catch { /* no ALSA either */ }
  }

  return { video, audio };
}
