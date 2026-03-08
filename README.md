# good-dog 🐶

Dog barking monitoring and training project.

A self-hosted, cross-platform dog bark detector that continuously records audio and video, detects barks using spectral analysis, and provides a web UI to review events and configure the system.

---

## Features

- **Continuous A/V recording** – rolling 24-hour archive of segmented audio (and optionally video) recordings
- **Real-time bark detection** – spectral analysis (Goertzel algorithm) gives a 0–1 probability score per bark episode
- **Event clips** – each detected bark is saved as a WAV file with a configurable before/after buffer, plus optional video
- **Web UI** – live video feed, audio level meter, bark event browser, 24-hour recording review, and settings panel
- **Real-time push** – WebSocket broadcasts bark events and audio levels to all connected clients instantly
- **Notification service** – stubbed webhook / email / MQTT dispatcher; webhook is fully implemented, email and MQTT log stubs ready for real implementations
- **Cross-platform** – works on Linux, macOS, and Windows; bundled ffmpeg binary via `ffmpeg-static`

---

## Requirements

- **Node.js ≥ 22.5** (uses the built-in `node:sqlite` module)
- No other system dependencies – ffmpeg is bundled via `ffmpeg-static`

---

## Quick start

```bash
# Install dependencies
npm install

# Start the server (default port 3000)
npm start

# Or in watch/dev mode
npm run dev
```

Then open **http://localhost:3000** in your browser.

---

## Remote access (ngrok)

To expose the UI publicly over the internet, start the server first and then run ngrok **in a separate terminal**:

```bash
# Terminal 1 – start the server
npm run dev

# Terminal 2 – expose it via ngrok
npm run ngrok
```

ngrok will print a public `https://` URL you can open from anywhere.

> **Note:** The free ngrok plan allows only one simultaneous agent session. Make sure no other ngrok processes are running before executing `npm run ngrok`. You can check with `pkill -f ngrok` to clean up any stale sessions.

---

## Configuration

Settings can be changed at any time from the **⚙️ Settings** tab in the UI, or by editing `data/config.json` directly.

| Setting | Default | Description |
|---|---|---|
| `detection.threshold` | `0.55` | Minimum probability (0–1) to trigger a bark event |
| `detection.minDuration` | `0.15 s` | Shortest accepted bark episode |
| `detection.beforeBuffer` | `5 s` | Pre-bark audio included in event clip |
| `detection.afterBuffer` | `10 s` | Post-bark audio included in event clip |
| `recording.segmentDuration` | `300 s` | Duration of each continuous recording segment |
| `recording.maxAgeSecs` | `86400 s` | Maximum age for stored recordings (24 h) |
| `recording.audioDevice` | `default` | Input audio device name (platform-specific) |
| `recording.videoDevice` | `default` | Input video device name |
| `recording.videoEnabled` | `true` | Enable/disable video capture |
| `server.port` | `3000` | HTTP server port |
| `notification.enabled` | `false` | Enable notifications |
| `notification.type` | `webhook` | `webhook` \| `email` \| `mqtt` |
| `notification.endpoint` | `""` | Webhook URL / email address / MQTT broker |
| `notification.minProbability` | `0.7` | Minimum probability to trigger a notification |
| `notification.cooldownSecs` | `30` | Minimum seconds between notifications |

---

## Audio device names

| Platform | Format | Example |
|---|---|---|
| Linux | PulseAudio source name | `default` or `alsa_input.pci-0000_00_1f.3.analog-stereo` |
| macOS | AVFoundation device index | `:0` or `:1` |
| Windows | DirectShow device name | `Microphone (Realtek High Definition Audio)` |

Run `ffmpeg -list_devices true -f avfoundation -i ""` (macOS) or `ffmpeg -list_devices true -f dshow -i ""` (Windows) to enumerate available devices.

---

## Architecture

```
src/
├── server.js              # HTTP + WebSocket server, static files
├── router.js              # Lightweight HTTP router (no framework)
├── config.js              # JSON config management
├── db.js                  # SQLite (node:sqlite) initialisation
├── audioCapture.js        # ffmpeg PCM capture + ring buffer + WAV clip writer
├── barkDetector.js        # Spectral analysis bark detector (Goertzel)
├── videoCapture.js        # ffmpeg MJPEG capture → WebSocket frames
├── continuousRecorder.js  # Rolling 24-h A/V segment recorder
├── eventStore.js          # Bark event + recording CRUD (SQLite)
├── notificationService.js # Webhook / email / MQTT dispatcher
└── api/
    ├── configRoutes.js
    ├── eventRoutes.js
    └── recordingRoutes.js

public/
├── index.html
├── app.js                 # Tab routing + WebSocket client
├── style.css
└── components/
    ├── live-feed.js        # Real-time video + audio level (Web Component)
    ├── event-list.js       # Bark event browser (Web Component)
    ├── event-player.js     # Event detail / playback modal (Web Component)
    ├── config-panel.js     # Settings form (Web Component)
    └── recordings-browser.js # 24-h archive browser (Web Component)
```

### Bark detection algorithm

1. ffmpeg captures audio from the default microphone as raw 16-bit PCM (16 kHz, mono)
2. Incoming PCM is processed in 50 ms frames with 25 ms hop
3. Per frame:
   - RMS energy is computed; adaptive noise floor is updated slowly
   - Goertzel algorithm computes energy in bark-characteristic bands (400–2500 Hz)
   - A 0–1 probability score = `energyScore × (0.4 + 0.6 × spectralRatio)`
4. A bark episode begins when `score ≥ threshold`, ends when `score < threshold × 0.45`
5. Episodes shorter than `minDuration` are discarded

---

## Development

```bash
# Run tests
npm test

# Watch mode server
npm run dev
```

Data is stored in `data/`:
- `data/good-dog.db`  – SQLite database
- `data/config.json`  – configuration
- `data/events/`      – WAV clips of bark events
- `data/recordings/`  – continuous A/V archive segments

---

## Notification service

The notification service is designed for extension. Currently:

- **Webhook** – fully implemented: HTTP POST with JSON payload
- **Email** – stub (logs to console); implement with `nodemailer` or an email API
- **MQTT** – stub (logs to console); implement with `mqtt.js`

Payload sent on each notification:

```json
{
  "type": "bark",
  "timestamp": 1700000000000,
  "probability": 0.82,
  "duration": 0.34,
  "audioFile": "/abs/path/to/clip.wav"
}
```

