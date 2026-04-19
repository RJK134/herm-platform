import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Mock prisma so `import prisma from '../../utils/prisma'` — used by every
// router transitively — doesn't open a real DB connection when tests run.
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

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { status: 'ok' },
    });
  });

  it('echoes the request id header', async () => {
    const res = await request(app).get('/api/health').set('x-request-id', 'test-rid-123');
    expect(res.headers['x-request-id']).toBe('test-rid-123');
  });

  it('generates a request id when none is provided', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});
