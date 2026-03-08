/**
 * api/configRoutes.js – GET /api/config, PUT /api/config, GET /api/devices
 */

import { loadConfig, saveConfig, validateConfig } from '../config.js';
import { enumerateDevices } from '../deviceEnumerator.js';
import { sendJson, readBody } from '../router.js';

export function registerConfigRoutes(router) {
  router.get('/api/devices', async (_req, res) => {
    try {
      const devices = await enumerateDevices();
      sendJson(res, 200, devices);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  router.get('/api/config', (_req, res) => {
    sendJson(res, 200, loadConfig());
  });

  router.put('/api/config', async (req, res) => {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }

    try {
      validateConfig(body);
    } catch (err) {
      return sendJson(res, 422, { error: err.message });
    }

    try {
      saveConfig(body);
      sendJson(res, 200, loadConfig());
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
}
