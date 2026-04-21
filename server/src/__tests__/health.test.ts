import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { liveness, readiness } from '../api/health/health.controller';

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const queryRaw = vi.fn();
vi.mock('../utils/prisma', () => ({
  default: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

function buildApp() {
  const app = express();
  app.get('/api/health', liveness);
  app.get('/api/ready', readiness);
  return app;
}

describe('health endpoints', () => {
  it('GET /api/health returns 200 with status ok', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('GET /api/ready returns 200 when the DB responds', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = await request(buildApp()).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.checks.database.ok).toBe(true);
  });

  it('GET /api/ready returns 503 when the DB check fails', async () => {
    queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(buildApp()).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.checks.database.ok).toBe(false);
  });
});
