"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyMiddleware = apiKeyMiddleware;
const config_1 = require("./config");
const PUBLIC_PATHS = ['/health', '/metrics'];
function apiKeyMiddleware(req, res, next) {
    if (PUBLIC_PATHS.some(p => req.path.startsWith(p))) {
        next();
        return;
    }
    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-api-key'];
    let key;
    if (authHeader?.startsWith('Bearer ')) {
        key = authHeader.slice(7);
    }
    else if (typeof apiKeyHeader === 'string') {
        key = apiKeyHeader;
    }
    if (key === config_1.config.apiKey) {
        next();
    }
    else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}
//# sourceMappingURL=auth.js.map