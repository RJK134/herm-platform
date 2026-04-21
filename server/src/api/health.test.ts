import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    expect(res.body.data.version).toBe('2.0.0');
    expect(res.body.data.timestamp).toBeDefined();
  });

  it('returns 503 when the readiness probe cannot reach the database', async () => {
    $queryRaw.mockRejectedValueOnce(new Error('Connection refused'));
    const res = await request(app).get('/api/readiness');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.status).toBe('not-ready');
    expect(res.body.data.checks).toEqual({ db: 'fail' });
  });
});
