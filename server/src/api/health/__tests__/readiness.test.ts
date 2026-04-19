import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

const $queryRaw = vi.fn();

vi.mock('../../../utils/prisma', () => ({
  default: {
    $queryRaw: (...args: unknown[]) => $queryRaw(...args),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

let app: Express;

beforeAll(async () => {
  const mod = await import('../../../app');
  app = mod.createApp();
});

describe('GET /api/readiness', () => {
  beforeEach(() => {
    $queryRaw.mockReset();
  });

  it('returns 200 when the database is reachable', async () => {
    $queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = await request(app).get('/api/readiness');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { status: 'ready', checks: { db: 'ok' } },
    });
  });

  it('returns 503 when the database check fails', async () => {
    $queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app).get('/api/readiness');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      success: false,
      data: { status: 'not-ready', checks: { db: 'fail' } },
    });
  });
});
