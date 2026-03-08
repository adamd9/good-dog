/**
 * recordings-browser.js – Browse and playback the rolling 24-hour A/V archive.
 */

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: block; }
  .toolbar { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .toolbar h2 { font-size: 1.1rem; font-weight: 600; flex: 1; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
  .rec-card {
    background: var(--clr-surface); border: 1px solid var(--clr-border); border-radius: 8px;
    padding: 1rem; display: flex; flex-direction: column; gap: .5rem;
  }
  .rec-card h3 { font-size: .875rem; font-weight: 600; }
  .rec-meta { font-size: .75rem; color: var(--clr-muted); }
  .rec-meta span + span::before { content: ' · '; }
  .rec-actions { display: flex; gap: .5rem; margin-top: .25rem; }
  audio { width: 100%; }
  .empty-state { text-align: center; padding: 3rem; color: var(--clr-muted); }
  .time-filter { display: flex; align-items: center; gap: .5rem; font-size: .85rem; }
  .time-filter label { color: var(--clr-muted); margin: 0; white-space: nowrap; }
  .time-filter select { width: auto; padding: .35rem .6rem; }
</style>
<div class="toolbar">
  <h2>📼 Recordings</h2>
  <div class="time-filter">
    <label for="time-select">Show last:</label>
    <select id="time-select">
      <option value="3600">1 hour</option>
      <option value="21600">6 hours</option>
      <option value="43200">12 hours</option>
      <option value="86400" selected>24 hours</option>
    </select>
  </div>
  <button class="btn btn-secondary" id="refresh-btn">↻ Refresh</button>
</div>
<div id="grid" class="grid"></div>
`;

class RecordingsBrowser extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
    }

    this._grid = this.shadowRoot.getElementById('grid');
    this.shadowRoot.getElementById('refresh-btn').addEventListener('click', () => this._load());
    this.shadowRoot.getElementById('time-select').addEventListener('change', () => this._load());

    document.addEventListener('tab-activated', (e) => {
      if (e.detail === 'recordings') this._load();
    });

    this._load();
  }

  async _load() {
    const secs  = Number(this.shadowRoot.getElementById('time-select').value);
    const since = Date.now() - secs * 1000;
    const res   = await fetch(`/api/recordings?since=${since}`);
    if (!res.ok) return;
    const recs = await res.json();
    this._render(recs);
  }

  _render(recs) {
    this._grid.innerHTML = '';

    if (!recs.length) {
      this._grid.innerHTML = `<div class="empty-state"><div style="font-size:2.5rem">📼</div><p>No recordings found</p></div>`;
      return;
    }

    for (const rec of recs) {
      const start   = new Date(rec.startTime).toLocaleString();
      const end     = rec.endTime ? new Date(rec.endTime).toLocaleTimeString() : '—';
      const sizeMb  = rec.sizeBytes ? `${(rec.sizeBytes / 1e6).toFixed(1)} MB` : '';

      const card = document.createElement('div');
      card.className = 'rec-card';
      card.innerHTML = `
        <h3>${start}</h3>
        <div class="rec-meta">
          <span>End: ${end}</span>
          ${sizeMb ? `<span>${sizeMb}</span>` : ''}
        </div>
        <div class="rec-actions">
          <audio controls src="/api/recordings/${rec.id}/audio" preload="none"></audio>
        </div>
        ${rec.videoFile ? `<video controls src="/api/recordings/${rec.id}/video" style="width:100%;border-radius:6px;margin-top:.25rem" preload="none"></video>` : ''}
      `;
      this._grid.appendChild(card);
    }
  }
}

customElements.define('recordings-browser', RecordingsBrowser);
