import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma';
import pino from 'pino';
import { config } from '../../config';

const logger = pino({ name: 'EventsRoute', level: config.logLevel });
const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const {
    from,
    to,
    reviewed,
    threshold,
    page = '1',
    limit = '20',
  } = req.query as Record<string, string | undefined>;

  const pageNum = Math.max(1, parseInt(page ?? '1'));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20')));
  const skip = (pageNum - 1) * limitNum;

  try {
    const where: Record<string, unknown> = {};
    if (from || to) {
      const startTimeFilter: Record<string, Date> = {};
      if (from) startTimeFilter['gte'] = new Date(from);
      if (to) startTimeFilter['lte'] = new Date(to);
      where['startTime'] = startTimeFilter;
    }
    if (reviewed !== undefined) {
      where['reviewed'] = reviewed === 'true';
    }
    if (threshold !== undefined) {
      where['confidence'] = { gte: parseFloat(threshold) };
    }

    const [events, total] = await Promise.all([
      prisma.barkEvent.findMany({ where, skip, take: limitNum, orderBy: { startTime: 'desc' } }),
      prisma.barkEvent.count({ where }),
    ]);

    res.json({ events, total, page: pageNum, limit: limitNum });
  } catch (err) {
    logger.warn({ err }, 'DB unavailable');
    res.json({ events: [], total: 0, page: pageNum, limit: limitNum });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const event = await prisma.barkEvent.findUnique({ where: { id: req.params['id'] } });
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    res.json(event);
  } catch (err) {
    logger.warn({ err }, 'DB unavailable');
    res.status(503).json({ error: 'Database unavailable' });
  }
});

router.post('/:id/label', async (req: Request, res: Response) => {
  const { label } = req.body as { label: string };
  try {
    const event = await prisma.barkEvent.update({
      where: { id: req.params['id'] },
      data: { label, reviewed: true },
    });
    res.json(event);
  } catch (err) {
    logger.warn({ err }, 'DB unavailable');
    res.status(503).json({ error: 'Database unavailable' });
  }
});

export default router;
