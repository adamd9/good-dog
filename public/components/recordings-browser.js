/**
 * recordings-browser.js – 24-hour timeline of continuous recordings + bark events.
 *
 * • Recording segments are shown as horizontal bars on the timeline track.
 * • Bark events are shown as vertical markers, coloured by probability.
 * • Click anywhere on a segment to seek to that point and play the stream.
 * • Click an event marker to play that individual bark clip.
 * • A playhead follows audio playback position on the timeline.
 */

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: block; }

  /* ---- Toolbar ---- */
  .toolbar {
    display: flex; align-items: center; gap: .75rem;
    flex-wrap: wrap; margin-bottom: 1rem;
  }
  .toolbar h2 { font-size: 1.1rem; font-weight: 600; flex: 1; }
  .time-filter { display: flex; align-items: center; gap: .5rem; font-size: .85rem; }
  .time-filter label { color: var(--clr-muted); margin: 0; white-space: nowrap; }
  .time-filter select { width: auto; padding: .35rem .6rem; }

  /* ---- Timeline wrapper ---- */
  .tl-wrap {
    background: var(--clr-surface);
    border: 1px solid var(--clr-border);
    border-radius: 8px;
    padding: 1rem 1rem .75rem;
    margin-bottom: 1rem;
    overflow-x: auto;
  }
  .tl-inner { position: relative; min-width: 560px; }

  /* ---- Ruler ---- */
  .tl-ruler { position: relative; height: 22px; margin-bottom: 4px; }
  .tl-tick {
    position: absolute; bottom: 0; transform: translateX(-50%);
    font-size: .65rem; color: var(--clr-muted); white-space: nowrap; pointer-events: none;
  }
  .tl-tick::before {
    content: ''; display: block; width: 1px; height: 5px;
    background: var(--clr-border); margin: 0 auto 2px;
  }

  /* ---- Track ---- */
  .tl-track {
    position: relative; height: 64px;
    background: var(--clr-bg); border: 1px solid var(--clr-border);
    border-radius: 4px; overflow: visible;
  }

  /* ---- Segments ---- */
  .tl-seg {
    position: absolute; top: 50%; transform: translateY(-50%);
    height: 18px; background: var(--clr-primary); border-radius: 3px;
    opacity: .55; cursor: pointer; min-width: 3px;
    transition: opacity .15s, height .15s;
  }
  .tl-seg:hover { opacity: .9; height: 26px; }
  .tl-seg.selected { opacity: 1; height: 26px; outline: 2px solid var(--clr-accent); outline-offset: 1px; }

  /* ---- Event markers ---- */
  .tl-event {
    position: absolute; top: 6px; width: 4px; height: 52px;
    border-radius: 2px; transform: translateX(-50%);
    cursor: pointer; opacity: .7; transition: opacity .15s, width .15s; z-index: 2;
  }
  .tl-event:hover { opacity: 1; width: 7px; }
  .tl-event.selected { opacity: 1; outline: 2px solid #fff; outline-offset: 1px; }
  .tl-event.prob-high   { background: var(--clr-danger); }
  .tl-event.prob-medium { background: var(--clr-accent); }
  .tl-event.prob-low    { background: var(--clr-muted); }

  /* ---- Playhead ---- */
  .tl-playhead {
    position: absolute; top: 0; bottom: 0; width: 2px;
    background: rgba(255,255,255,.85); pointer-events: none;
    display: none; z-index: 10;
  }
  .tl-playhead::after {
    content: ''; position: absolute; top: -4px; left: -4px;
    width: 10px; height: 10px; border-radius: 50%; background: white;
  }

  /* ---- Legend ---- */
  .legend {
    display: flex; gap: 1.25rem; font-size: .72rem;
    color: var(--clr-muted); margin-top: .65rem; flex-wrap: wrap;
  }
  .legend-item { display: flex; align-items: center; gap: .35rem; }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }

  /* ---- Player panel ---- */
  .player-panel {
    background: var(--clr-surface); border: 1px solid var(--clr-border);
    border-radius: 8px; padding: 1rem;
  }
  .player-label { font-size: .8rem; color: var(--clr-muted); margin-bottom: .65rem; }
  .player-label strong { color: var(--clr-text); }
  audio { width: 100%; display: block; }
  video { width: 100%; display: none; border-radius: 6px; margin-top: .5rem; background: #000; }
  video.show { display: block; }

  /* ---- Empty / loading ---- */
  .empty-state { text-align: center; padding: 2.5rem; color: var(--clr-muted); font-size: .875rem; }

  /* ---- Tooltip ---- */
  .tl-tooltip {
    position: fixed; background: var(--clr-surface);
    border: 1px solid var(--clr-border); border-radius: 6px;
    padding: .3rem .65rem; font-size: .75rem; pointer-events: none;
    z-index: 9999; display: none; white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,.5);
  }
</style>

<div class="toolbar">
  <h2>📅 Timeline</h2>
  <div class="time-filter">
    <label for="window-sel">Show last:</label>
    <select id="window-sel">
      <option value="3600">1 hour</option>
      <option value="10800">3 hours</option>
      <option value="21600">6 hours</option>
      <option value="43200">12 hours</option>
      <option value="86400" selected>24 hours</option>
    </select>
  </div>
  <button class="btn btn-secondary" id="refresh-btn">↻ Refresh</button>
</div>

<div class="tl-wrap">
  <div class="tl-inner" id="tl-inner">
    <div class="tl-ruler" id="ruler"></div>
    <div class="tl-track" id="track">
      <div class="tl-playhead" id="playhead"></div>
    </div>
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:var(--clr-primary)"></div>Recording</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--clr-danger)"></div>High (≥80%)</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--clr-accent)"></div>Medium (60–79%)</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--clr-muted)"></div>Low (&lt;60%)</div>
    </div>
  </div>
</div>

<div class="player-panel">
  <div class="player-label" id="player-label">← Click a recording segment to play, or a marker to hear a bark</div>
  <audio id="audio-el" controls preload="none"></audio>
  <video id="video-el" controls preload="none"></video>
</div>

<div class="tl-tooltip" id="tooltip"></div>
`;

class RecordingsBrowser extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
    }

    this._track    = this.shadowRoot.getElementById('track');
    this._ruler    = this.shadowRoot.getElementById('ruler');
    this._playhead = this.shadowRoot.getElementById('playhead');
    this._audio    = this.shadowRoot.getElementById('audio-el');
    this._video    = this.shadowRoot.getElementById('video-el');
    this._label    = this.shadowRoot.getElementById('player-label');
    this._tooltip  = this.shadowRoot.getElementById('tooltip');

    this._windowMs    = 86400 * 1000;
    this._windowStart = Date.now() - this._windowMs;
    this._windowEnd   = Date.now();
    this._recordings  = [];
    this._events      = [];
    this._selectedSeg = null;
    this._selectedEvt = null;
    this._currentRec  = null;
    this._activePlayer = null;

    this.shadowRoot.getElementById('refresh-btn')
      .addEventListener('click', () => this._load());
    this.shadowRoot.getElementById('window-sel')
      .addEventListener('change', (e) => {
        this._windowMs = Number(e.target.value) * 1000;
        this._load();
      });

    this._audio.addEventListener('timeupdate', () => this._updatePlayhead());
    this._audio.addEventListener('ended',      () => { this._playhead.style.display = 'none'; });
    this._video.addEventListener('timeupdate', () => this._updatePlayhead());
    this._video.addEventListener('ended',      () => { this._playhead.style.display = 'none'; });
    this._video.addEventListener('timeupdate', () => this._updatePlayhead());
    this._video.addEventListener('ended',      () => { this._playhead.style.display = 'none'; });

    document.addEventListener('tab-activated', (e) => {
      if (e.detail === 'recordings') this._load();
    });

    this._load();
  }

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  async _load() {
    const secs = Math.round(this._windowMs / 1000);
    try {
      const res = await fetch(`/api/timeline?window=${secs}`);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      this._windowStart = data.windowStart;
      this._windowEnd   = data.windowEnd;
      this._recordings  = data.recordings;
      this._events      = data.events;
    } catch {
      this._windowEnd   = Date.now();
      this._windowStart = this._windowEnd - this._windowMs;
      this._recordings  = [];
      this._events      = [];
    }
    this._render();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  _toPercent(ts) {
    return ((ts - this._windowStart) / (this._windowEnd - this._windowStart)) * 100;
  }

  _render() {
    this._track.innerHTML = '';
    this._track.appendChild(this._playhead);
    this._ruler.innerHTML = '';
    this._selectedSeg = null;
    this._selectedEvt = null;
    this._renderRuler();
    this._renderSegments();
    this._renderEvents();

    if (!this._recordings.length && !this._events.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No recordings in this window yet.';
      this._track.appendChild(empty);
    }
  }

  _renderRuler() {
    const windowSecs = this._windowMs / 1000;
    let tickMs;
    if      (windowSecs <=  3600)  tickMs = 15 * 60 * 1000;
    else if (windowSecs <= 10800)  tickMs = 30 * 60 * 1000;
    else if (windowSecs <= 21600)  tickMs = 60 * 60 * 1000;
    else                           tickMs =  2 * 60 * 60 * 1000;

    // Align ticks to local-timezone boundaries, not UTC epoch boundaries.
    const tzOffsetMs = new Date().getTimezoneOffset() * 60 * 1000; // UTC − local (ms)
    const firstLocal = Math.ceil((this._windowStart - tzOffsetMs) / tickMs) * tickMs;
    const first      = firstLocal + tzOffsetMs;
    for (let t = first; t <= this._windowEnd; t += tickMs) {
      const pct = this._toPercent(t);
      if (pct < 0 || pct > 100) continue;
      const tick = document.createElement('div');
      tick.className    = 'tl-tick';
      tick.style.left   = `${pct}%`;
      tick.textContent  = new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this._ruler.appendChild(tick);
    }
  }

  _renderSegments() {
    for (const rec of this._recordings) {
      const endMs    = rec.endTime || Date.now();
      const leftPct  = Math.max(0,   this._toPercent(rec.startTime));
      const rightPct = Math.min(100, this._toPercent(endMs));
      const widthPct = rightPct - leftPct;
      if (widthPct <= 0) continue;

      const el = document.createElement('div');
      el.className   = 'tl-seg';
      el.style.left  = `${leftPct}%`;
      el.style.width = `${Math.max(widthPct, 0.25)}%`;
      el.dataset.id  = rec.id;

      const startStr = new Date(rec.startTime).toLocaleTimeString();
      const endStr   = rec.endTime ? new Date(rec.endTime).toLocaleTimeString() : 'now';

      el.addEventListener('mouseenter', (e) => this._showTooltip(e, `${startStr} – ${endStr}`));
      el.addEventListener('mousemove',  (e) => this._moveTooltip(e));
      el.addEventListener('mouseleave', ()  => this._hideTooltip());
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect       = el.getBoundingClientRect();
        const fraction   = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const offsetSecs = fraction * ((endMs - rec.startTime) / 1000);
        this._playSegment(rec, offsetSecs);
        this._selectEl(el, 'seg');
      });

      this._track.appendChild(el);
    }
  }

  _renderEvents() {
    for (const evt of this._events) {
      const pct = this._toPercent(evt.timestamp);
      if (pct < 0 || pct > 100) continue;

      const p       = evt.probability;
      const probCls = p >= 0.8 ? 'prob-high' : p >= 0.6 ? 'prob-medium' : 'prob-low';

      const el = document.createElement('div');
      el.className  = `tl-event ${probCls}`;
      el.style.left = `${pct}%`;
      el.dataset.id = evt.id;

      const timeStr = new Date(evt.timestamp).toLocaleTimeString();
      const pctStr  = Math.round(evt.probability * 100);

      el.addEventListener('mouseenter', (e) => this._showTooltip(e, `🔔 ${timeStr} · ${pctStr}%`));
      el.addEventListener('mousemove',  (e) => this._moveTooltip(e));
      el.addEventListener('mouseleave', ()  => this._hideTooltip());
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._playEvent(evt);
        this._selectEl(el, 'evt');
      });

      this._track.appendChild(el);
    }
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  _selectEl(el, type) {
    if (this._selectedSeg) this._selectedSeg.classList.remove('selected');
    if (this._selectedEvt) this._selectedEvt.classList.remove('selected');
    if (type === 'seg') { this._selectedSeg = el; this._selectedEvt = null; }
    else                { this._selectedEvt = el; this._selectedSeg = null; }
    el.classList.add('selected');
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  _playSegment(rec, offsetSecs = 0) {
    this._currentRec = rec;
    const playMs  = rec.startTime + offsetSecs * 1000;
    const timeStr = new Date(playMs).toLocaleString();
    this._label.innerHTML = `▶ Playing from <strong>${timeStr}</strong>`;

    if (rec.videoFile) {
      // Combined A/V recording — video element is the only player needed
      const video = this._video;
      video.src = `/api/recordings/${rec.id}/video`;
      video.classList.add('show');
      video.load();
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = offsetSecs;
        video.play().catch(() => {});
      }, { once: true });
      // Clear and silence audio element
      this._audio.pause();
      this._audio.removeAttribute('src');
      this._audio.load();
      this._activePlayer = video;
    } else {
      // Audio-only recording
      const audio = this._audio;
      audio.src = `/api/recordings/${rec.id}/audio`;
      audio.load();
      audio.addEventListener('loadedmetadata', () => {
        audio.currentTime = offsetSecs;
        audio.play().catch(() => {});
      }, { once: true });
      this._video.pause();
      this._video.removeAttribute('src');
      this._video.classList.remove('show');
      this._video.load();
      this._activePlayer = audio;
    }
  }

  _playEvent(evt) {
    this._currentRec = null;
    this._playhead.style.display = 'none';
    const timeStr = new Date(evt.timestamp).toLocaleString();
    const pctStr  = Math.round(evt.probability * 100);
    this._label.innerHTML = `🔔 Bark at <strong>${timeStr}</strong> · ${pctStr}% confidence`;

    const audio = this._audio;
    audio.src = `/api/events/${evt.id}/audio`;
    audio.load();
    audio.play().catch(() => {});

    const video = this._video;
    if (evt.videoFile) {
      video.src = `/api/events/${evt.id}/video`;
      video.classList.add('show');
      video.load();
      video.play().catch(() => {});
    } else {
      video.src = '';
      video.classList.remove('show');
    }
  }

  // ---------------------------------------------------------------------------
  // Playhead
  // ---------------------------------------------------------------------------

  _updatePlayhead() {
    if (!this._currentRec || !this._activePlayer) return;
    const nowMs = this._currentRec.startTime + this._activePlayer.currentTime * 1000;
    const pct   = this._toPercent(nowMs);
    if (pct < 0 || pct > 100) {
      this._playhead.style.display = 'none';
      return;
    }
    this._playhead.style.display = 'block';
    this._playhead.style.left    = `${pct}%`;
  }

  // ---------------------------------------------------------------------------
  // Tooltip
  // ---------------------------------------------------------------------------

  _showTooltip(e, text) {
    this._tooltip.textContent   = text;
    this._tooltip.style.display = 'block';
    this._moveTooltip(e);
  }
  _moveTooltip(e) {
    this._tooltip.style.left = `${e.clientX + 14}px`;
    this._tooltip.style.top  = `${e.clientY - 32}px`;
  }
  _hideTooltip() {
    this._tooltip.style.display = 'none';
  }
}

customElements.define('recordings-browser', RecordingsBrowser);