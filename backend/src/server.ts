import 'express-async-errors';
import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import pino from 'pino';

import { config } from './config';
import { apiKeyMiddleware } from './auth';
import { prisma } from './prisma';
import { wsManager } from './api/websocket';
import { renderMetrics, incrementDetections, setDetectionLatency } from './metrics';
import { CircularBuffer } from './recording/CircularBuffer';
import { HeuristicDetector } from './detectors/HeuristicDetector';

import detectorsRouter from './api/routes/detectors';
import eventsRouter from './api/routes/events';
import recordingsRouter from './api/routes/recordings';
import configRouter from './api/routes/config';

const logger = pino({ name: 'Server', level: config.logLevel });

export const app = express();

// Middleware
app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(cors());
app.use(express.json());

// Public routes
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/metrics', (_req: Request, res: Response) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(renderMetrics());
});

// Protected API routes
app.use('/api', apiKeyMiddleware);
app.use('/api/detectors', detectorsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/recordings', recordingsRouter);
app.use('/api/config', configRouter);

// Protected file serving for audio/video slices
// Path must be validated against storage root to prevent traversal
app.get('/files/*', apiKeyMiddleware, (req: Request, res: Response) => {
  const path = require('path') as typeof import('path');
  const fs = require('fs') as typeof import('fs');
  const relativePath = req.params[0] as string;
  // Normalise and ensure it stays within storage root
  const storagePath = path.resolve(config.storagePath);
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
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

export const server = http.createServer(app);

// Shared circular buffer for detection loop
export const circularBuffer = new CircularBuffer(3000);

const heuristicDetector = new HeuristicDetector('heuristic-default', {
  threshold: config.detectorThreshold,
  sensitivity: 1.0,
  modelName: 'heuristic-v1',
  sampleRate: config.sampleRate,
});

// Only run detection loop and start listening when this is the main entry point
if (require.main === module) {
  // Connect to DB (non-fatal)
  prisma.$connect().catch((err: Error) => {
    logger.warn({ err }, 'DB connection failed - running without database');
  });

  // WebSocket
  wsManager.init(server);

  // Detection loop - runs every 100ms against buffered audio
  const detectionInterval = setInterval(async () => {
    if (circularBuffer.size === 0) return;

    const audioData = circularBuffer.getLastNSeconds(1, config.sampleRate);
    if (audioData.length < 2) return;

    const start = Date.now();
    try {
      const results = await heuristicDetector.detect(audioData, config.sampleRate);
      const latencyMs = Date.now() - start;
      setDetectionLatency(latencyMs);

      for (const result of results) {
        incrementDetections();
        wsManager.broadcast({ type: 'detection', data: result });
        logger.info({ confidence: result.confidence }, 'Bark detected');
      }
    } catch (err) {
      logger.error({ err }, 'Detection error');
    }
  }, 100);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    clearInterval(detectionInterval);
    server.close(() => {
      prisma.$disconnect().catch(() => undefined).finally(() => {
        logger.info('Server stopped');
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(config.port, () => {
    logger.info({ port: config.port }, 'Server running');
  });
}
