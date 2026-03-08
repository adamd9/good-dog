/**
 * config-panel.js – Settings / configuration UI.
 * Loads config from GET /api/config and saves via PUT /api/config.
 */

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: block; max-width: 680px; }
  h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 1.25rem; }
  .section { margin-bottom: 2rem; }
  .section h3 {
    font-size: .8rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--clr-muted); margin-bottom: 1rem;
    padding-bottom: .4rem; border-bottom: 1px solid var(--clr-border);
  }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 520px) { .grid-2 { grid-template-columns: 1fr; } }
  .value-label { font-size: .75rem; color: var(--clr-muted); margin-left: .5rem; }
  .action-row { display: flex; gap: .75rem; justify-content: flex-end; margin-top: 1.5rem; }
  .notification-options { margin-top: .75rem; display: none; }
  .notification-options.visible { display: block; }
  .chip {
    display: inline-flex; align-items: center; gap: .35rem;
    padding: .2rem .55rem; border-radius: 99px; border: 1px solid var(--clr-border);
    font-size: .75rem; cursor: pointer; color: var(--clr-muted);
    transition: color .15s, border-color .15s, background .15s;
  }
  .chip:hover { border-color: var(--clr-primary); color: var(--clr-primary); }
  .chip input { display: none; }
  .chip.selected { background: color-mix(in srgb, var(--clr-primary) 15%, transparent); color: var(--clr-primary); border-color: var(--clr-primary); }
</style>

<h2>⚙️ Settings</h2>

<div class="section">
  <h3>Detection</h3>
  <div class="grid-2">
    <div class="form-row">
      <label for="threshold">Threshold <span class="value-label" id="threshold-lbl"></span></label>
      <input type="range" id="threshold" min="0.1" max="1" step="0.01" />
    </div>
    <div class="form-row">
      <label for="min-duration">Min duration (s)</label>
      <input type="number" id="min-duration" min="0.05" max="5" step="0.05" />
    </div>
    <div class="form-row">
      <label for="before-buf">Before buffer (s)</label>
      <input type="number" id="before-buf" min="0" max="30" step="1" />
    </div>
    <div class="form-row">
      <label for="after-buf">After buffer (s)</label>
      <input type="number" id="after-buf" min="0" max="60" step="1" />
    </div>
  </div>
</div>

<div class="section">
  <h3>Recording</h3>
  <div class="grid-2">
    <div class="form-row">
      <label for="segment-duration">Segment duration (s)</label>
      <input type="number" id="segment-duration" min="30" max="3600" step="30" />
    </div>
    <div class="form-row">
      <label for="max-age">Max recording age (h)</label>
      <input type="number" id="max-age" min="1" max="168" step="1" />
    </div>
    <div class="form-row">
      <label for="audio-device">Audio device</label>
      <input type="text" id="audio-device" placeholder="default" />
    </div>
    <div class="form-row">
      <label for="video-device">Video device</label>
      <input type="text" id="video-device" placeholder="default" />
    </div>
    <div class="form-row-inline">
      <input type="checkbox" id="video-enabled" />
      <label for="video-enabled" style="margin:0">Enable video capture</label>
    </div>
  </div>
</div>

<div class="section">
  <h3>Notifications</h3>
  <div class="form-row-inline">
    <input type="checkbox" id="notif-enabled" />
    <label for="notif-enabled" style="margin:0">Enable notifications</label>
  </div>
  <div class="notification-options" id="notif-options">
    <div class="form-row" style="margin-top:.75rem">
      <label>Type</label>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <label class="chip" id="chip-webhook"><input type="radio" name="notif-type" value="webhook" />🌐 Webhook</label>
        <label class="chip" id="chip-email"><input type="radio" name="notif-type" value="email" />📧 Email (stub)</label>
        <label class="chip" id="chip-mqtt"><input type="radio" name="notif-type" value="mqtt" />📡 MQTT (stub)</label>
      </div>
    </div>
    <div class="form-row">
      <label for="notif-endpoint">Endpoint / address / broker</label>
      <input type="text" id="notif-endpoint" placeholder="https://..." />
    </div>
    <div class="grid-2">
      <div class="form-row">
        <label for="notif-min-prob">Min probability <span class="value-label" id="notif-prob-lbl"></span></label>
        <input type="range" id="notif-min-prob" min="0" max="1" step="0.01" />
      </div>
      <div class="form-row">
        <label for="notif-cooldown">Cooldown (s)</label>
        <input type="number" id="notif-cooldown" min="0" max="3600" step="5" />
      </div>
    </div>
  </div>
</div>

<div class="action-row">
  <button class="btn btn-secondary" id="reset-btn">Reset to defaults</button>
  <button class="btn btn-primary"   id="save-btn">Save settings</button>
</div>
`;

class ConfigPanel extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
      this._wireUp();
    }
    document.addEventListener('tab-activated', (e) => {
      if (e.detail === 'settings') this._load();
    });
    this._load();
  }

  _wireUp() {
    const sr = this.shadowRoot;

    // Threshold label
    const threshInput = sr.getElementById('threshold');
    const threshLbl   = sr.getElementById('threshold-lbl');
    threshInput.addEventListener('input', () => {
      threshLbl.textContent = `(${Number(threshInput.value).toFixed(2)})`;
    });

    // Min-prob label
    const probInput = sr.getElementById('notif-min-prob');
    const probLbl   = sr.getElementById('notif-prob-lbl');
    probInput.addEventListener('input', () => {
      probLbl.textContent = `(${Number(probInput.value).toFixed(2)})`;
    });

    // Toggle notification options
    const notifChk = sr.getElementById('notif-enabled');
    notifChk.addEventListener('change', () => {
      sr.getElementById('notif-options').classList.toggle('visible', notifChk.checked);
    });

    // Radio chip highlighting
    sr.querySelectorAll('input[name="notif-type"]').forEach((radio) => {
      radio.addEventListener('change', () => this._syncChips());
    });

    sr.getElementById('save-btn').addEventListener('click', () => this._save());
    sr.getElementById('reset-btn').addEventListener('click', () => this._reset());
  }

  _syncChips() {
    const sr = this.shadowRoot;
    sr.querySelectorAll('input[name="notif-type"]').forEach((radio) => {
      const chip = radio.closest('.chip');
      chip.classList.toggle('selected', radio.checked);
    });
  }

  async _load() {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();
    this._populate(cfg);
  }

  _populate(cfg) {
    const sr = this.shadowRoot;
    const d  = cfg.detection   || {};
    const rec = cfg.recording  || {};
    const n  = cfg.notification || {};

    const setVal = (id, v) => { if (v !== undefined) sr.getElementById(id).value = v; };

    setVal('threshold',        d.threshold);
    sr.getElementById('threshold-lbl').textContent = `(${Number(d.threshold || 0).toFixed(2)})`;
    setVal('min-duration',     d.minDuration);
    setVal('before-buf',       d.beforeBuffer);
    setVal('after-buf',        d.afterBuffer);

    setVal('segment-duration', rec.segmentDuration);
    setVal('max-age',          Math.round((rec.maxAgeSecs || 86400) / 3600));
    setVal('audio-device',     rec.audioDevice);
    setVal('video-device',     rec.videoDevice);
    sr.getElementById('video-enabled').checked = rec.videoEnabled !== false;

    sr.getElementById('notif-enabled').checked = !!n.enabled;
    sr.getElementById('notif-options').classList.toggle('visible', !!n.enabled);

    const radio = sr.querySelector(`input[name="notif-type"][value="${n.type || 'webhook'}"]`);
    if (radio) { radio.checked = true; this._syncChips(); }

    setVal('notif-endpoint',   n.endpoint);
    setVal('notif-min-prob',   n.minProbability);
    sr.getElementById('notif-prob-lbl').textContent = `(${Number(n.minProbability || 0.7).toFixed(2)})`;
    setVal('notif-cooldown',   n.cooldownSecs);
  }

  async _save() {
    const sr = this.shadowRoot;
    const get = (id) => sr.getElementById(id);

    const cfg = {
      detection: {
        threshold:    Number(get('threshold').value),
        minDuration:  Number(get('min-duration').value),
        beforeBuffer: Number(get('before-buf').value),
        afterBuffer:  Number(get('after-buf').value),
      },
      recording: {
        segmentDuration: Number(get('segment-duration').value),
        maxAgeSecs:      Number(get('max-age').value) * 3600,
        audioDevice:     get('audio-device').value || 'default',
        videoDevice:     get('video-device').value || 'default',
        videoEnabled:    get('video-enabled').checked,
        audioEnabled:    true,
      },
      notification: {
        enabled:        get('notif-enabled').checked,
        type:           sr.querySelector('input[name="notif-type"]:checked')?.value || 'webhook',
        endpoint:       get('notif-endpoint').value,
        minProbability: Number(get('notif-min-prob').value),
        cooldownSecs:   Number(get('notif-cooldown').value),
      },
    };

    const res = await fetch('/api/config', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(cfg),
    });

    if (res.ok) {
      window.showToast('Settings saved ✓');
    } else {
      const err = await res.json().catch(() => ({}));
      window.showToast(err.error || 'Failed to save settings', 'danger');
    }
  }

  async _reset() {
    if (!confirm('Reset all settings to defaults?')) return;
    // PUT an empty object – the server will merge with defaults
    const res = await fetch('/api/config', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    });
    if (res.ok) {
      const cfg = await res.json();
      this._populate(cfg);
      window.showToast('Settings reset to defaults');
    }
  }
}

customElements.define('config-panel', ConfigPanel);
