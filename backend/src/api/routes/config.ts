import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma';
import { config as appConfig } from '../../config';
import pino from 'pino';

const logger = pino({ name: 'ConfigRoute', level: appConfig.logLevel });
const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const dbEntries = await prisma.appConfig.findMany();
    const dbMap = Object.fromEntries(dbEntries.map((e) => [e.key, e.value]));
    res.json({ env: appConfig, db: dbMap });
  } catch (err) {
    logger.warn({ err }, 'DB unavailable, returning env config only');
    res.json({ env: appConfig, db: {} });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { key, value } = req.body as { key: string; value: unknown };
  if (!key) {
    res.status(400).json({ error: 'key is required' });
    return;
  }
  try {
    const entry = await prisma.appConfig.upsert({
      where: { key },
      update: { value: value as unknown as never },
      create: { key, value: value as unknown as never },
    });
    res.json(entry);
  } catch (err) {
    logger.error({ err }, 'Failed to upsert config');
    res.status(503).json({ error: 'Database unavailable' });
  }
});

export default router;
