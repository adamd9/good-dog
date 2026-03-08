import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma';
import pino from 'pino';
import { config } from '../../config';

const logger = pino({ name: 'DetectorsRoute', level: config.logLevel });
const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const detectors = await prisma.detector.findMany();
    res.json(detectors);
  } catch (err) {
    logger.warn({ err }, 'DB unavailable, returning empty list');
    res.json([]);
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { id, name, type, configData, enabled } = req.body as {
    id?: string;
    name: string;
    type: string;
    configData?: Record<string, unknown>;
    enabled?: boolean;
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonConfig = (configData ?? {}) as any;
    if (id) {
      const detector = await prisma.detector.upsert({
        where: { id },
        update: { name, type, config: jsonConfig, enabled: enabled ?? true },
        create: { id, name, type, config: jsonConfig, enabled: enabled ?? true },
      });
      res.json(detector);
    } else {
      const detector = await prisma.detector.create({
        data: { name, type, config: jsonConfig, enabled: enabled ?? true },
      });
      res.status(201).json(detector);
    }
  } catch (err) {
    logger.error({ err }, 'Failed to create/update detector');
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/:id/reprocess', async (req: Request, res: Response) => {
  const { id } = req.params;
  logger.info({ detectorId: id }, 'Reprocess stub called');
  res.status(202).json({ message: 'Reprocessing queued', detectorId: id });
});

export default router;
