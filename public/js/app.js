/**
 * good-dog front-end application
 *
 * Responsibilities:
 *  - Connect to the Socket.io server for real-time events
 *  - Drive the live probability bar / event list
 *  - Load and display continuous recordings with WaveSurfer
 *  - Render event clip players
 *  - Draw timeline markers over the loaded recording waveform
 */
/* global io, WaveSurfer */

'use strict';

// ─── Socket.io connection ────────────────────────────────────────────────────

const socket = io();

// ─── DOM refs ────────────────────────────────────────────────────────────────

const btnStart         = document.getElementById('btn-start');
const btnStop          = document.getElementById('btn-stop');
const statusPill       = document.getElementById('status-pill');
const probBar          = document.getElementById('prob-bar');
const probValue        = document.getElementById('prob-value');
const thresholdSlider  = document.getElementById('threshold-slider');
const thresholdDisplay = document.getElementById('threshold-display');
const detectionList    = document.getElementById('detection-list');
const recordingSelect  = document.getElementById('recording-select');
const btnLoadRecording = document.getElementById('btn-load-recording');
const recordingWaveformEl = document.getElementById('recording-waveform');
const recordingTimeline   = document.getElementById('recording-timeline');
const eventsReviewList    = document.getElementById('events-review-list');
const clipWaveformEl      = document.getElementById('clip-waveform');
const clipWsEl            = document.getElementById('clip-ws');
const clipPlay            = document.getElementById('clip-play');
const clipClose           = document.getElementById('clip-close');

// ─── State ───────────────────────────────────────────────────────────────────

let monitoring     = false;
let threshold      = 0.70;
let allEvents      = [];
let recordingWs    = null;  // WaveSurfer for continuous recording
let clipWs         = null;  // WaveSurfer for event clip

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function probColor(p) {
  if (p < 0.4) return 'var(--success)';
  if (p < 0.7) return 'var(--warn)';
  return 'var(--danger)';
}

function setMonitoringUI(active) {
  monitoring = active;
  btnStart.disabled = active;
  btnStop.disabled  = !active;
  if (active) {
    statusPill.textContent = '● Monitoring';
    statusPill.className   = 'status-pill monitoring';
  } else {
    statusPill.textContent = '● Idle';
    statusPill.className   = 'status-pill';
  }
}

// ─── Live probability bar ─────────────────────────────────────────────────────

function updateProbBar(p) {
  const pct = (p * 100).toFixed(1);
  probBar.style.width      = `${pct}%`;
  probBar.style.background = probColor(p);
  probValue.textContent    = p.toFixed(3);

  if (p >= threshold) {
    statusPill.textContent = '● BARK!';
    statusPill.className   = 'status-pill alert';
    // Revert after 2 s
    setTimeout(() => {
      if (monitoring) {
        statusPill.textContent = '● Monitoring';
        statusPill.className   = 'status-pill monitoring';
      }
    }, 2000);
  }
}

// ─── Detection event list ─────────────────────────────────────────────────────

function buildEventItem(event) {
  const li = document.createElement('li');
  li.className  = 'event-item';
  li.dataset.id = event.id;

  const badge = document.createElement('span');
  badge.className   = 'prob-badge';
  badge.textContent = (event.probability * 100).toFixed(0) + '%';

  const time = document.createElement('span');
  time.className   = 'event-time';
  time.textContent = formatTime(event.timestamp);

  const playBtn = document.createElement('button');
  playBtn.className   = 'play-btn';
  playBtn.textContent = '▶ Play';
  playBtn.title       = 'Play clip';

  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (event.audioFile) {
      openClipPlayer(`/api/events/${event.id}/audio`);
    } else {
      alert('Audio clip not yet available');
    }
  });

  li.append(badge, time, playBtn);
  return li;
}

function prependEvent(event) {
  allEvents.unshift(event);
  const li = buildEventItem(event);
  detectionList.prepend(li);

  // Keep the list manageable
  while (detectionList.children.length > 50) {
    detectionList.removeChild(detectionList.lastChild);
  }
}

// ─── Clip player ──────────────────────────────────────────────────────────────

function openClipPlayer(audioUrl) {
  if (clipWs) {
    clipWs.destroy();
    clipWs = null;
  }

  clipWsEl.innerHTML = '';
  clipWaveformEl.style.display = 'block';

  clipWs = WaveSurfer.create({
    container:   '#clip-ws',
    waveColor:   '#38bdf8',
    progressColor: '#0ea5e9',
    height:      64,
    normalize:   true,
  });

  clipWs.load(audioUrl);
  clipPlay.onclick = () => clipWs.playPause();
}

clipClose.addEventListener('click', () => {
  if (clipWs) { clipWs.destroy(); clipWs = null; }
  clipWaveformEl.style.display = 'none';
});

// ─── Recording review ─────────────────────────────────────────────────────────

function populateRecordingSelect(recordings) {
  recordingSelect.innerHTML = '<option value="">— select a recording block —</option>';
  recordings.forEach((r) => {
    const opt = document.createElement('option');
    opt.value       = r.filename;
    opt.textContent = r.filename.replace('.wav', '').replace('_', ' ');
    recordingSelect.appendChild(opt);
  });
}

function loadRecording(filename) {
  if (!filename) return;

  if (recordingWs) {
    recordingWs.destroy();
    recordingWs = null;
  }
  recordingWaveformEl.innerHTML = '';

  recordingWs = WaveSurfer.create({
    container:     '#recording-waveform',
    waveColor:     '#334155',
    progressColor: '#38bdf8',
    height:        80,
    normalize:     true,
  });

  recordingWs.load(`/api/recordings/${encodeURIComponent(filename)}`);

  recordingWs.on('ready', () => {
    drawTimelineMarkers(recordingWs.getDuration());
  });
}

function drawTimelineMarkers(totalDuration) {
  recordingTimeline.innerHTML = '';
  if (totalDuration <= 0) return;

  // Determine time range covered by the selected recording filename
  const filename = recordingSelect.value;
  if (!filename) return;

  // Parse start time from filename: YYYY-MM-DD_HH-mm-ss.wav
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/);
  if (!match) return;

  const dateStr = match[1];
  const timeParts = match[2].split('-');
  const blockStartMs = new Date(`${dateStr}T${timeParts.join(':')}`).getTime();
  const blockEndMs   = blockStartMs + totalDuration * 1000;

  allEvents.forEach((evt) => {
    const evtMs = new Date(evt.timestamp).getTime();
    if (evtMs < blockStartMs || evtMs > blockEndMs) return;

    const fraction = (evtMs - blockStartMs) / (blockEndMs - blockStartMs);
    const marker = document.createElement('div');
    marker.className = 'timeline-marker';
    marker.style.left = `${(fraction * 100).toFixed(2)}%`;
    marker.title = `Bark at ${formatTime(evt.timestamp)} (${(evt.probability * 100).toFixed(0)}%)`;
    marker.addEventListener('click', () => {
      const seekSeconds = fraction * totalDuration;
      recordingWs.seekTo(seekSeconds / totalDuration);
    });
    recordingTimeline.appendChild(marker);
  });
}

// ─── Socket.io event handlers ─────────────────────────────────────────────────

socket.on('status', (data) => {
  setMonitoringUI(data.monitoring);
  threshold = data.threshold;
  thresholdSlider.value  = threshold;
  thresholdDisplay.textContent = threshold.toFixed(2);

  // Load existing events
  if (Array.isArray(data.events)) {
    data.events.forEach((e) => prependEvent(e));
  }

  // Populate recording select
  if (Array.isArray(data.recordings)) {
    populateRecordingSelect(data.recordings);
  }

  // Populate events review list
  if (Array.isArray(data.events)) {
    populateEventsReviewList(data.events);
  }
});

socket.on('level', (data) => {
  updateProbBar(data.probability);
});

socket.on('bark-detected', (event) => {
  prependEvent(event);
});

socket.on('bark-event-saved', (event) => {
  // Update the existing list item with the audio file info
  const existing = document.querySelector(`[data-id="${event.id}"]`);
  if (existing) {
    existing.replaceWith(buildEventItem(event));
  }
  // Also add/update in events review list
  addToEventsReviewList(event);
  allEvents = allEvents.map((e) => (e.id === event.id ? event : e));
});

socket.on('monitoring-state', (data) => {
  setMonitoringUI(data.monitoring);
});

socket.on('recording-saved', (data) => {
  // Add the new recording to the select
  const opt = document.createElement('option');
  opt.value = data.path.replace(/^.*[/\\]/, '');
  opt.textContent = opt.value.replace('.wav', '').replace('_', ' ');
  recordingSelect.appendChild(opt);
});

socket.on('config-updated', (data) => {
  if (data.threshold !== undefined) {
    threshold = data.threshold;
    thresholdSlider.value = threshold;
    thresholdDisplay.textContent = threshold.toFixed(2);
  }
});

// ─── Events review list ──────────────────────────────────────────────────────

function populateEventsReviewList(events) {
  eventsReviewList.innerHTML = '';
  events.forEach((e) => addToEventsReviewList(e));
}

function addToEventsReviewList(event) {
  const existing = eventsReviewList.querySelector(`[data-id="${event.id}"]`);
  if (existing) {
    existing.replaceWith(buildEventItem(event));
    return;
  }
  eventsReviewList.prepend(buildEventItem(event));
  while (eventsReviewList.children.length > 100) {
    eventsReviewList.removeChild(eventsReviewList.lastChild);
  }
}

// ─── Button handlers ──────────────────────────────────────────────────────────

btnStart.addEventListener('click', () => socket.emit('start-monitoring'));
btnStop.addEventListener ('click', () => socket.emit('stop-monitoring'));

btnLoadRecording.addEventListener('click', () => {
  loadRecording(recordingSelect.value);
});

thresholdSlider.addEventListener('input', () => {
  threshold = parseFloat(thresholdSlider.value);
  thresholdDisplay.textContent = threshold.toFixed(2);
  socket.emit('set-threshold', { threshold });
});
