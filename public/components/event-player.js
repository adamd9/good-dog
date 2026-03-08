/**
 * event-player.js – Modal player for a single bark event (audio + metadata).
 */

const styles = `
  :host { display: block; }
  dialog {
    background: var(--clr-surface);
    border: 1px solid var(--clr-border);
    border-radius: 8px;
    color: var(--clr-text);
    padding: 0;
    width: min(600px, 95vw);
    max-height: 85vh;
    overflow: auto;
  }
  dialog::backdrop { background: rgba(0,0,0,.7); }
  .dialog-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem 1.25rem; border-bottom: 1px solid var(--clr-border);
    position: sticky; top: 0; background: var(--clr-surface); z-index: 1;
  }
  .dialog-header h2 { font-size: 1rem; font-weight: 600; }
  .close-btn { background: none; border: none; color: var(--clr-muted); cursor: pointer; font-size: 1.25rem; line-height: 1; }
  .close-btn:hover { color: var(--clr-text); }
  .dialog-body { padding: 1.25rem; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem 1.5rem; margin-bottom: 1.25rem; }
  .meta-item label { font-size: .75rem; color: var(--clr-muted); margin-bottom: .2rem; display: block; }
  .meta-item span { font-weight: 500; }
  audio { width: 100%; margin-top: .5rem; accent-color: var(--clr-primary); }
  video { width: 100%; border-radius: 6px; margin-top: .75rem; display: none; }
  video.visible { display: block; }
  .notes-row { margin-top: 1rem; }
  .notes-row textarea { resize: vertical; min-height: 80px; }
  .action-row { display: flex; gap: .75rem; margin-top: 1rem; justify-content: flex-end; }
  .prob-bar { height: 6px; background: var(--clr-border); border-radius: 3px; overflow: hidden; margin-top: .35rem; }
  .prob-fill { height: 100%; border-radius: 3px; transition: width .4s ease; }
  .reviewed-badge {
    display: inline-flex; align-items: center; gap: .35rem;
    font-size: .75rem; padding: .2rem .55rem;
    border-radius: 99px; border: 1px solid var(--clr-border);
    color: var(--clr-muted);
  }
  .reviewed-badge.yes { color: var(--clr-success); border-color: var(--clr-success); }
`;

class EventPlayer extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = styles;
      this.shadowRoot.appendChild(style);
      this._dialog = document.createElement('dialog');
      this.shadowRoot.appendChild(this._dialog);
    }
  }

  async show(eventId) {
    const res = await fetch(`/api/events/${eventId}`);
    if (!res.ok) return window.showToast('Failed to load event', 'danger');
    const event = await res.json();
    this._event = event;
    this._render(event);
    this._dialog.showModal();
  }

  _render(event) {
    const pct   = Math.round(event.probability * 100);
    const color = pct >= 80 ? 'var(--clr-danger)' : pct >= 60 ? 'var(--clr-accent)' : 'var(--clr-muted)';

    this._dialog.innerHTML = `
      <div class="dialog-header">
        <h2>🔔 Bark Event</h2>
        <div style="display:flex;align-items:center;gap:.75rem;">
          <span class="reviewed-badge${event.reviewed ? ' yes' : ''}">${event.reviewed ? '✓ Reviewed' : '○ Unreviewed'}</span>
          <button class="close-btn" id="close-btn">✕</button>
        </div>
      </div>
      <div class="dialog-body">
        <div class="meta-grid">
          <div class="meta-item">
            <label>Time</label>
            <span>${new Date(event.timestamp).toLocaleString()}</span>
          </div>
          <div class="meta-item">
            <label>Duration</label>
            <span>${event.duration < 1 ? Math.round(event.duration * 1000) + ' ms' : event.duration.toFixed(2) + ' s'}</span>
          </div>
          <div class="meta-item">
            <label>Probability</label>
            <span>${pct}%</span>
            <div class="prob-bar"><div class="prob-fill" style="width:${pct}%;background:${color}"></div></div>
          </div>
        </div>

        <label style="font-size:.8rem;color:var(--clr-muted);margin-bottom:.35rem;display:block;">Audio Clip</label>
        <audio controls src="/api/events/${event.id}/audio"></audio>

        ${event.videoFile ? `<video controls class="visible" src="/api/events/${event.id}/video"></video>` : ''}

        <div class="notes-row">
          <label for="notes-input">Notes</label>
          <textarea id="notes-input" placeholder="Add a note…">${event.notes || ''}</textarea>
        </div>
        <div class="action-row">
          <button class="btn btn-secondary" id="mark-btn">${event.reviewed ? 'Mark unreviewed' : 'Mark reviewed'}</button>
          <button class="btn btn-danger"    id="del-btn">Delete</button>
          <button class="btn btn-primary"   id="save-btn">Save notes</button>
        </div>
      </div>
    `;

    this._dialog.querySelector('#close-btn').addEventListener('click', () => this._dialog.close());
    this._dialog.querySelector('#save-btn').addEventListener('click', () => this._saveNotes());
    this._dialog.querySelector('#mark-btn').addEventListener('click', () => this._toggleReviewed());
    this._dialog.querySelector('#del-btn').addEventListener('click',  () => this._delete());
  }

  async _saveNotes() {
    const notes = this._dialog.querySelector('#notes-input').value;
    const res = await fetch(`/api/events/${this._event.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    if (res.ok) {
      window.showToast('Notes saved');
    } else {
      window.showToast('Failed to save notes', 'danger');
    }
  }

  async _toggleReviewed() {
    const res = await fetch(`/api/events/${this._event.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed: !this._event.reviewed }),
    });
    if (res.ok) {
      this._event = await res.json();
      this._dialog.close();
      document.dispatchEvent(new CustomEvent('events-changed'));
      window.showToast('Event updated');
    } else {
      window.showToast('Update failed', 'danger');
    }
  }

  async _delete() {
    if (!confirm('Delete this bark event?')) return;
    const res = await fetch(`/api/events/${this._event.id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      this._dialog.close();
      document.dispatchEvent(new CustomEvent('events-changed'));
      window.showToast('Event deleted');
    } else {
      window.showToast('Delete failed', 'danger');
    }
  }
}

customElements.define('event-player', EventPlayer);
