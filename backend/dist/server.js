"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.circularBuffer = exports.server = exports.app = void 0;
require("express-async-errors");
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const pino_http_1 = __importDefault(require("pino-http"));
const pino_1 = __importDefault(require("pino"));
const config_1 = require("./config");
const auth_1 = require("./auth");
const prisma_1 = require("./prisma");
const websocket_1 = require("./api/websocket");
const metrics_1 = require("./metrics");
const CircularBuffer_1 = require("./recording/CircularBuffer");
const HeuristicDetector_1 = require("./detectors/HeuristicDetector");
const detectors_1 = __importDefault(require("./api/routes/detectors"));
const events_1 = __importDefault(require("./api/routes/events"));
const recordings_1 = __importDefault(require("./api/routes/recordings"));
const config_2 = __importDefault(require("./api/routes/config"));
const logger = (0, pino_1.default)({ name: 'Server', level: config_1.config.logLevel });
exports.app = (0, express_1.default)();
// Middleware
exports.app.use((0, pino_http_1.default)({ logger }));
exports.app.use((0, helmet_1.default)());
exports.app.use((0, cors_1.default)());
exports.app.use(express_1.default.json());
// Public routes
exports.app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
exports.app.get('/metrics', (_req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send((0, metrics_1.renderMetrics)());
});
// Protected API routes
exports.app.use('/api', auth_1.apiKeyMiddleware);
exports.app.use('/api/detectors', detectors_1.default);
exports.app.use('/api/events', events_1.default);
exports.app.use('/api/recordings', recordings_1.default);
exports.app.use('/api/config', config_2.default);
// Protected file serving for audio/video slices
// Path must be validated against storage root to prevent traversal
exports.app.get('/files/*', auth_1.apiKeyMiddleware, (req, res) => {
    const path = require('path');
    const fs = require('fs');
    const relativePath = req.params[0];
    // Normalise and ensure it stays within storage root
    const storagePath = path.resolve(config_1.config.storagePath);
    const fullPath = path.normalize(path.join(storagePath, relativePath));
    if (!fullPath.startsWith(storagePath + path.sep) && fullPath !== storagePath) {
        res.status(400).json({ error: 'Invalid path' });
        return;
    }
    if (!fs.existsSync(fullPath)) {
        res.status(404).json({ error: 'File not found' });
        return;
    }
    res.sendFile(fullPath);
});
// Error handler
exports.app.use((err, _req, res, _next) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: err.message ?? 'Internal server error' });
});
exports.server = http_1.default.createServer(exports.app);
// Shared circular buffer for detection loop
exports.circularBuffer = new CircularBuffer_1.CircularBuffer(3000);
const heuristicDetector = new HeuristicDetector_1.HeuristicDetector('heuristic-default', {
    threshold: config_1.config.detectorThreshold,
    sensitivity: 1.0,
    modelName: 'heuristic-v1',
    sampleRate: config_1.config.sampleRate,
});
// Only run detection loop and start listening when this is the main entry point
if (require.main === module) {
    // Connect to DB (non-fatal)
    prisma_1.prisma.$connect().catch((err) => {
        logger.warn({ err }, 'DB connection failed - running without database');
    });
    // WebSocket
    websocket_1.wsManager.init(exports.server);
    // Detection loop - runs every 100ms against buffered audio
    const detectionInterval = setInterval(async () => {
        if (exports.circularBuffer.size === 0)
            return;
        const audioData = exports.circularBuffer.getLastNSeconds(1, config_1.config.sampleRate);
        if (audioData.length < 2)
            return;
        const start = Date.now();
        try {
            const results = await heuristicDetector.detect(audioData, config_1.config.sampleRate);
            const latencyMs = Date.now() - start;
            (0, metrics_1.setDetectionLatency)(latencyMs);
            for (const result of results) {
                (0, metrics_1.incrementDetections)();
                websocket_1.wsManager.broadcast({ type: 'detection', data: result });
                logger.info({ confidence: result.confidence }, 'Bark detected');
            }
        }
        catch (err) {
            logger.error({ err }, 'Detection error');
        }
    }, 100);
    // Graceful shutdown
    const shutdown = async (signal) => {
        logger.info({ signal }, 'Shutting down...');
        clearInterval(detectionInterval);
        exports.server.close(() => {
            prisma_1.prisma.$disconnect().catch(() => undefined).finally(() => {
                logger.info('Server stopped');
                process.exit(0);
            });
        });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    exports.server.listen(config_1.config.port, () => {
        logger.info({ port: config_1.config.port }, 'Server running');
    });
}
//# sourceMappingURL=server.js.map