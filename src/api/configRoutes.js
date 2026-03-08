/**
 * api/configRoutes.js – GET /api/config and PUT /api/config
 */

import { loadConfig, saveConfig, validateConfig } from '../config.js';
import { sendJson, readBody } from '../router.js';

export function registerConfigRoutes(router) {
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
