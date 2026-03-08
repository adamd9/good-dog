/**
 * notificationService.js – Stubbed notification dispatcher.
 *
 * Supports three notification types:
 *   'webhook' – HTTP POST to a configured URL
 *   'email'   – logs a message (stub; real implementation would use nodemailer / SES)
 *   'mqtt'    – logs a message (stub; real implementation would use mqtt.js)
 *
 * Respects a cooldown period to avoid notification storms.
 */

import { loadConfig, DEFAULTS } from './config.js';

let _lastNotified = 0;

/**
 * Evaluate a bark event against notification config and dispatch if appropriate.
 *
 * @param {object} event  BarkEvent (with audioFile)
 */
export async function maybeNotify(event) {
  const config = loadConfig();
  const n = config.notification;

  if (!n.enabled) return;
  if (event.probability < (n.minProbability ?? DEFAULTS.notification.minProbability)) return;

  const cooldownMs = (n.cooldownSecs ?? DEFAULTS.notification.cooldownSecs) * 1000;
  if (Date.now() - _lastNotified < cooldownMs) return;

  _lastNotified = Date.now();

  const payload = {
    type:        'bark',
    timestamp:   event.timestamp,
    probability: event.probability,
    duration:    event.duration,
    audioFile:   event.audioFile,
  };

  try {
    switch (n.type) {
      case 'webhook':
        await _dispatchWebhook(n.endpoint, payload);
        break;
      case 'email':
        _dispatchEmailStub(n.endpoint, payload);
        break;
      case 'mqtt':
        _dispatchMqttStub(n.endpoint, payload);
        break;
      default:
        console.warn(`[notify] Unknown notification type: ${n.type}`);
    }
  } catch (err) {
    console.error('[notify] Dispatch error:', err.message);
  }
}

/** Reset last-notified timestamp (useful for testing). */
export function resetCooldown() {
  _lastNotified = 0;
}

// ---------------------------------------------------------------------------

async function _dispatchWebhook(url, payload) {
  if (!url) {
    console.warn('[notify] Webhook URL not configured');
    return;
  }

  const body = JSON.stringify(payload);
  const response = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'good-dog/1.0' },
    body,
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Webhook returned HTTP ${response.status}`);
  }

  console.log(`[notify] Webhook delivered (HTTP ${response.status})`);
}

function _dispatchEmailStub(address, payload) {
  // TODO: implement with nodemailer or an email API
  console.log(`[notify] [STUB] Email to ${address}:`, JSON.stringify(payload));
}

function _dispatchMqttStub(broker, payload) {
  // TODO: implement with mqtt.js
  console.log(`[notify] [STUB] MQTT to ${broker}:`, JSON.stringify(payload));
}
