import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

vi.mock('../../../utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

let app: Express;

beforeAll(async () => {
  const mod = await import('../../../app');
  app = mod.createApp();
});

// Baskets carry institutional requirements data. Before this hardening pass,
// /api/baskets was fully public — these tests lock down the fix.
describe('baskets router is protected by authenticateJWT', () => {
  it('GET /api/baskets without a token → 401', async () => {
    const res = await request(app).get('/api/baskets');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('POST /api/baskets without a token → 401', async () => {
    const res = await request(app).post('/api/baskets').send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  it('GET /api/baskets/:id/evaluate without a token → 401', async () => {
    const res = await request(app).get('/api/baskets/abc/evaluate');
    expect(res.status).toBe(401);
  });
});
