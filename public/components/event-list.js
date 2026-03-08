/**
 * event-list.js – Bark events browser with pagination and inline player.
 */

import { bus, formatTs, probClass } from '../app.js';

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: block; }
  .toolbar { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .toolbar h2 { font-size: 1.1rem; font-weight: 600; flex: 1; }
  .events-table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  .events-table th {
    text-align: left; padding: .6rem .75rem;
    border-bottom: 2px solid var(--clr-border);
    font-size: .75rem; color: var(--clr-muted); text-transform: uppercase; letter-spacing: .05em;
  }
  .events-table td { padding: .55rem .75rem; border-bottom: 1px solid var(--clr-border); vertical-align: middle; }
  .events-table tr:hover td { background: color-mix(in srgb, var(--clr-primary) 5%, transparent); cursor: pointer; }
  .events-table tr.reviewed td { opacity: .55; }
  .play-btn { background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--clr-primary); padding: 0 .25rem; }
  .pagination { display: flex; align-items: center; gap: .5rem; margin-top: 1rem; justify-content: flex-end; font-size: .85rem; }
  .pagination button { min-width: 2rem; }
  .filter-row { display: flex; align-items: center; gap: .5rem; font-size: .85rem; }
  .filter-row label { color: var(--clr-muted); margin: 0; white-space: nowrap; }
  .filter-row select { width: auto; padding: .35rem .6rem; }
</style>

<div class="toolbar">
  <h2>🔔 Bark Events</h2>
  <div class="filter-row">
    <label for="filter-reviewed">Show:</label>
    <select id="filter-reviewed">
      <option value="all">All</option>
      <option value="unreviewed">Unreviewed</option>
      <option value="reviewed">Reviewed</option>
    </select>
  </div>
  <button class="btn btn-secondary" id="refresh-btn">↻ Refresh</button>
</div>

<div id="table-wrap">
  <table class="events-table">
    <thead>
      <tr>
        <th>Time</th>
        <th>Probability</th>
        <th>Duration</th>
        <th>Status</th>
        <th></th>
      </tr>
    </thead>
    <tbody id="tbody"></tbody>
  </table>
</div>

<div class="pagination">
  <button class="btn btn-secondary" id="prev-btn" disabled>‹ Prev</button>
  <span id="page-info">Page 1</span>
  <button class="btn btn-secondary" id="next-btn">Next ›</button>
</div>

<event-player id="player"></event-player>
`;

const PAGE_SIZE = 20;

class EventList extends HTMLElement {
  constructor() {
    super();
    this._page    = 0;
    this._filter  = 'all';
    this._total   = 0;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
    }

    this._tbody   = this.shadowRoot.getElementById('tbody');
    this._player  = this.shadowRoot.getElementById('player');
    this._pageInfo = this.shadowRoot.getElementById('page-info');

    this.shadowRoot.getElementById('refresh-btn').addEventListener('click', () => this._load());
    this.shadowRoot.getElementById('prev-btn').addEventListener('click', () => { this._page--; this._load(); });
    this.shadowRoot.getElementById('next-btn').addEventListener('click', () => { this._page++; this._load(); });
    this.shadowRoot.getElementById('filter-reviewed').addEventListener('change', (e) => {
      this._filter = e.target.value;
      this._page   = 0;
      this._load();
    });

    // Reload when bark event received or events changed
    this._onBark   = () => this._load();
    this._onChange = () => this._load();
    bus.addEventListener('bark', this._onBark);
    document.addEventListener('events-changed', this._onChange);

    document.addEventListener('tab-activated', (e) => {
      if (e.detail === 'events') this._load();
    });

    this._load();
  }

  disconnectedCallback() {
    bus.removeEventListener('bark', this._onBark);
    document.removeEventListener('events-changed', this._onChange);
  }

  async _load() {
    const params = new URLSearchParams({
      limit:  PAGE_SIZE,
      offset: this._page * PAGE_SIZE,
    });
    if (this._filter === 'reviewed')   params.set('reviewed', 'true');

    const res = await fetch(`/api/events?${params}`);
    if (!res.ok) return;

    const events = await res.json();
    this._render(events);

    // Update pagination controls
    const prev = this.shadowRoot.getElementById('prev-btn');
    const next = this.shadowRoot.getElementById('next-btn');
    prev.disabled = this._page === 0;
    next.disabled = events.length < PAGE_SIZE;
    this._pageInfo.textContent = `Page ${this._page + 1}`;
  }

  _render(events) {
    this._tbody.innerHTML = '';

    if (!events.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" style="text-align:center;padding:2rem;color:var(--clr-muted)">No events found</td>`;
      this._tbody.appendChild(tr);
      return;
    }

    for (const ev of events) {
      const pct   = Math.round(ev.probability * 100);
      const color = pct >= 80 ? 'var(--clr-danger)' : pct >= 60 ? 'var(--clr-accent)' : 'var(--clr-muted)';
      const dur   = ev.duration < 1
        ? `${Math.round(ev.duration * 1000)} ms`
        : `${ev.duration.toFixed(2)} s`;

      const tr = document.createElement('tr');
      if (ev.reviewed) tr.classList.add('reviewed');
      tr.innerHTML = `
        <td>${new Date(ev.timestamp).toLocaleString()}</td>
        <td>
          <span style="color:${color};font-weight:600">${pct}%</span>
          <div style="height:4px;background:var(--clr-border);border-radius:2px;margin-top:.3rem;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:2px"></div>
          </div>
        </td>
        <td>${dur}</td>
        <td>${ev.reviewed ? '<span style="color:var(--clr-success);font-size:.75rem">✓ reviewed</span>' : ''}</td>
        <td><button class="play-btn" title="Play">▶</button></td>
      `;

      tr.querySelector('.play-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this._player.show(ev.id);
      });
      tr.addEventListener('click', () => this._player.show(ev.id));
      this._tbody.appendChild(tr);
    }
  }
}

customElements.define('event-list', EventList);
