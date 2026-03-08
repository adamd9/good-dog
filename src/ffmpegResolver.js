/**
 * ffmpegResolver.js – Return the best available ffmpeg binary path.
 *
 * On macOS the bundled ffmpeg-static binary has a Hardened Runtime without
 * the com.apple.security.device.camera entitlement, so the OS blocks camera
 * access even when the parent app (e.g. VS Code) has been granted permission.
 *
 * We therefore prefer a system ffmpeg (e.g. installed via `brew install ffmpeg`)
 * and only fall back to ffmpeg-static when no system binary can be found.
 */

import { execFileSync } from 'node:child_process';
import ffmpegStaticPath from 'ffmpeg-static';

function resolveFfmpeg() {
  try {
    const found = execFileSync('which', ['ffmpeg'], {
      encoding: 'utf-8',
      timeout: 2000,
    }).trim();
    if (found) return found;
  } catch { /* ffmpeg not on PATH */ }
  return ffmpegStaticPath;
}

export const ffmpegPath = resolveFfmpeg();
