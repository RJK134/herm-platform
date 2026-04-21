import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../app';

const $queryRaw = vi.fn();

vi.mock('../utils/prisma', () => ({
  default: {
    $queryRaw: (...args: unknown[]) => $queryRaw(...args),
    $disconnect: vi.fn(),
  },
}));

describe('health routes', () => {
  beforeEach(() => {
    $queryRaw.mockReset();
    $queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  });

  it('returns 200 with status ok for the liveness probe', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.version).toBeDefined();
    expect(res.body.data.timestamp).toBeDefined();
  });

  it('returns 200 when the readiness probe can reach the database', async () => {
    const res = await request(app).get('/api/readiness');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.checks.db).toBe('ok');
    expect(res.body.data.checks.database.ok).toBe(true);
  });

  it('returns 503 when the readiness probe cannot reach the database', async () => {
    $queryRaw.mockRejectedValueOnce(new Error('Connection refused'));
    const res = await request(app).get('/api/readiness');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.status).toBe('not_ready');
    expect(res.body.data.checks.db).toBe('fail');
    expect(res.body.data.checks.database.ok).toBe(false);
  });

  it('exposes /api/ready as a readiness alias', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.checks.database.ok).toBe(true);
  });
});
