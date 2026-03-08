import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma';
import pino from 'pino';
import { config } from '../../config';

const logger = pino({ name: 'RecordingsRoute', level: config.logLevel });
const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };

  try {
    const where: Record<string, unknown> = {};
    if (from || to) {
      const filter: Record<string, Date> = {};
      if (from) filter['gte'] = new Date(from);
      if (to) filter['lte'] = new Date(to);
      where['startTime'] = filter;
    }

    const recordings = await prisma.recording.findMany({
      where,
      orderBy: { startTime: 'desc' },
    });
    res.json(recordings);
  } catch (err) {
    logger.warn({ err }, 'DB unavailable');
    res.json([]);
  }
});

export default router;
