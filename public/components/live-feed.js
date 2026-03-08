/**
 * live-feed.js – Real-time video feed + audio level meter Web Component.
 */

import { bus, formatTs, probClass, formatDuration } from '../app.js';

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: block; }
  .grid { display: grid; grid-template-columns: 1fr 320px; gap: 1rem; }
  @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }

  .video-card { position: relative; background: #000; border-radius: 8px; overflow: hidden; aspect-ratio: 4/3; }
  .video-card canvas { width: 100%; height: 100%; object-fit: contain; display: block; }
  .video-card .no-signal {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #555; font-size: .9rem; gap: .5rem;
  }
  .video-card .no-signal .icon { font-size: 2.5rem; }

  .side-panel { display: flex; flex-direction: column; gap: 1rem; }

  /* Audio level meter */
  .level-card { padding: 1rem; background: var(--clr-surface); border: 1px solid var(--clr-border); border-radius: 8px; }
  .level-card h3 { font-size: .8rem; color: var(--clr-muted); margin-bottom: .75rem; text-transform: uppercase; letter-spacing: .05em; }
  .meter { height: 12px; background: var(--clr-border); border-radius: 6px; overflow: hidden; margin-bottom: .5rem; }
  .meter-fill { height: 100%; background: var(--clr-primary); border-radius: 6px; transition: width .1s linear; width: 0%; }
  .meter-fill.warn { background: var(--clr-accent); }
  .meter-fill.peak { background: var(--clr-danger); }
  .meter-labels { display: flex; justify-content: space-between; font-size: .7rem; color: var(--clr-muted); }

  /* Recent bark events */
  .bark-feed { padding: 1rem; background: var(--clr-surface); border: 1px solid var(--clr-border); border-radius: 8px; flex: 1; overflow: hidden; display: flex; flex-direction: column; }
  .bark-feed h3 { font-size: .8rem; color: var(--clr-muted); margin-bottom: .75rem; text-transform: uppercase; letter-spacing: .05em; flex-shrink: 0; }
  .bark-list { overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: .5rem; }
  .bark-item {
    display: flex; align-items: center; gap: .6rem;
    padding: .5rem .75rem;
    background: color-mix(in srgb, var(--clr-danger) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--clr-danger) 30%, transparent);
    border-radius: 6px;
    font-size: .8rem;
    animation: pop .3s ease;
  }
  @keyframes pop { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: none; } }
  .bark-item .prob { font-weight: 700; color: var(--clr-danger); min-width: 3rem; }
  .bark-item .meta { color: var(--clr-muted); font-size: .7rem; }
  .no-events { color: var(--clr-muted); font-size: .8rem; text-align: center; padding: 1rem; }
</style>
<div class="grid">
  <div class="video-card">
    <canvas id="canvas" width="640" height="480"></canvas>
    <div class="no-signal" id="no-signal">
      <span class="icon">📷</span>
      <span>Waiting for video feed…</span>
    </div>
  </div>
  <div class="side-panel">
    <div class="level-card card">
      <h3>Audio Level</h3>
      <div class="meter"><div class="meter-fill" id="rms-bar"></div></div>
      <div class="meter-labels"><span>0</span><span>RMS</span><span>max</span></div>
      <div class="meter" style="margin-top:.4rem"><div class="meter-fill" id="peak-bar"></div></div>
      <div class="meter-labels"><span>0</span><span>Peak</span><span>max</span></div>
    </div>
    <div class="bark-feed card">
      <h3>🔔 Recent Barks</h3>
      <div class="bark-list" id="bark-list">
        <p class="no-events">No barks detected yet</p>
      </div>
    </div>
  </div>
</div>
`;

class LiveFeed extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
    }

    this._canvas   = this.shadowRoot.getElementById('canvas');
    this._ctx      = this._canvas.getContext('2d');
    this._noSignal = this.shadowRoot.getElementById('no-signal');
    this._rmsBar   = this.shadowRoot.getElementById('rms-bar');
    this._peakBar  = this.shadowRoot.getElementById('peak-bar');
    this._barkList = this.shadowRoot.getElementById('bark-list');
    this._hasVideo = false;

    this._onFrame  = (e) => this._renderFrame(e.detail);
    this._onLevel  = (e) => this._renderLevel(e.detail);
    this._onBark   = (e) => this._addBarkItem(e.detail.event);

    bus.addEventListener('video-frame', this._onFrame);
    bus.addEventListener('level',       this._onLevel);
    bus.addEventListener('bark',        this._onBark);
  }

  disconnectedCallback() {
    bus.removeEventListener('video-frame', this._onFrame);
    bus.removeEventListener('level',       this._onLevel);
    bus.removeEventListener('bark',        this._onBark);
  }

  _renderFrame(blob) {
    if (!this._hasVideo) {
      this._hasVideo = true;
      this._noSignal.style.display = 'none';
    }
    createImageBitmap(blob).then((bmp) => {
      this._canvas.width  = bmp.width;
      this._canvas.height = bmp.height;
      this._ctx.drawImage(bmp, 0, 0);
      bmp.close();
    });
  }

  _renderLevel({ rms, peak }) {
    const rPct = Math.min(100, rms * 500);
    const pPct = Math.min(100, peak * 500);

    this._rmsBar.style.width = `${rPct}%`;
    this._rmsBar.className = `meter-fill${rPct > 80 ? ' peak' : rPct > 50 ? ' warn' : ''}`;

    this._peakBar.style.width = `${pPct}%`;
    this._peakBar.className = `meter-fill${pPct > 80 ? ' peak' : pPct > 50 ? ' warn' : ''}`;
  }

  _addBarkItem(event) {
    if (!event) return;
    const empty = this._barkList.querySelector('.no-events');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = 'bark-item';
    const pct = Math.round((event.probability || 0) * 100);
    item.innerHTML = `
      <span class="prob">${pct}%</span>
      <div>
        <div>${new Date(event.timestamp || Date.now()).toLocaleTimeString()}</div>
        <div class="meta">${event.duration ? (event.duration.toFixed(2) + 's') : ''}</div>
      </div>
    `;
    this._barkList.prepend(item);

    // Keep last 20 items
    while (this._barkList.children.length > 20) {
      this._barkList.lastChild.remove();
    }
  }
}

customElements.define('live-feed', LiveFeed);
