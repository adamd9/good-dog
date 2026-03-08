/**
 * app.js – Main application bootstrap.
 * Handles:
 *  - Tab navigation
 *  - WebSocket connection management
 *  - Global event bus for WS messages
 *  - Toast notification helper
 */

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;

    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', String(b === btn));
    });

    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `tab-${tab}`);
    });

    // Notify custom elements that their tab became active
    document.dispatchEvent(new CustomEvent('tab-activated', { detail: tab }));
  });
});

// ---------------------------------------------------------------------------
// Toast helper – used by all components
// ---------------------------------------------------------------------------

const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
document.body.appendChild(toastContainer);

export function showToast(message, type = 'info', durationMs = 4000) {
  const el = document.createElement('div');
  el.className = `toast${type === 'danger' ? ' danger' : ''}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}

window.showToast = showToast;

// ---------------------------------------------------------------------------
// WebSocket connection
// ---------------------------------------------------------------------------

const wsStatus = document.getElementById('ws-status');
let ws = null;
let wsReconnectTimer = null;

export const bus = new EventTarget();

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.binaryType = 'arraybuffer';

  ws.addEventListener('open', () => {
    wsStatus.className = 'status-dot connected';
    wsStatus.title = 'WebSocket connected';
    clearTimeout(wsReconnectTimer);
    // Subscribe to video by default only when on Live tab
    if (document.querySelector('#tab-live.active')) {
      ws.send(JSON.stringify({ type: 'subscribe', channel: 'video' }));
    }
  });

  ws.addEventListener('close', () => {
    wsStatus.className = 'status-dot disconnected';
    wsStatus.title = 'WebSocket disconnected';
    wsReconnectTimer = setTimeout(connectWs, 3000);
  });

  ws.addEventListener('error', () => {
    ws.close();
  });

  ws.addEventListener('message', (evt) => {
    if (evt.data instanceof ArrayBuffer) {
      // Binary message: first byte is type tag
      const view = new Uint8Array(evt.data);
      if (view[0] === 0x01) {
        // Video frame
        const jpegBlob = new Blob([evt.data.slice(1)], { type: 'image/jpeg' });
        bus.dispatchEvent(new CustomEvent('video-frame', { detail: jpegBlob }));
      }
      return;
    }

    try {
      const msg = JSON.parse(evt.data);
      bus.dispatchEvent(new CustomEvent(msg.type, { detail: msg }));
    } catch { /* ignore */ }
  });
}

// Subscribe/unsubscribe video when tabs change
document.addEventListener('tab-activated', (e) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (e.detail === 'live') {
    ws.send(JSON.stringify({ type: 'subscribe',   channel: 'video' }));
  } else {
    ws.send(JSON.stringify({ type: 'unsubscribe', channel: 'video' }));
  }
});

connectWs();

// Export ws for components
export function getWs() { return ws; }

// ---------------------------------------------------------------------------
// Utility: format date/time
// ---------------------------------------------------------------------------

export function formatTs(ts) {
  return new Date(ts).toLocaleString();
}

export function formatDuration(secs) {
  return secs < 1 ? `${Math.round(secs * 1000)} ms` : `${secs.toFixed(2)} s`;
}

export function probClass(p) {
  if (p >= 0.8) return 'prob-high';
  if (p >= 0.6) return 'prob-medium';
  return 'prob-low';
}
