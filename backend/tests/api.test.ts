// Mock prisma before importing app
jest.mock('@prisma/client', () => {
  const mockPrismaClient = jest.fn().mockImplementation(() => ({
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    detector: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'det-1', name: 'test', type: 'heuristic', config: {}, enabled: true, createdAt: new Date(), updatedAt: new Date() }),
      upsert: jest.fn().mockResolvedValue({ id: 'det-1' }),
    },
    barkEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      count: jest.fn().mockResolvedValue(0),
    },
    recording: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    appConfig: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({ key: 'test', value: 'val', updatedAt: new Date() }),
    },
  }));
  return { PrismaClient: mockPrismaClient };
});

import request from 'supertest';
import { app } from '../src/server';

const API_KEY = 'changeme';

describe('API', () => {
  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /metrics returns 200', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
  });

  it('GET /api/events returns 200 with valid API key', async () => {
    const res = await request(app)
      .get('/api/events')
      .set('X-API-Key', API_KEY);
    expect(res.status).toBe(200);
  });

  it('GET /api/detectors returns 200 with valid API key', async () => {
    const res = await request(app)
      .get('/api/detectors')
      .set('X-API-Key', API_KEY);
    expect(res.status).toBe(200);
  });

  it('GET /api/events returns 401 without API key', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(401);
  });
});
