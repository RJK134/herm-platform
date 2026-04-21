import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app';

// Mock Prisma so tests don't need a live DB
vi.mock('../utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn(),
  },
}));

describe('GET /api/health', () => {
  it('returns 200 with status ok (liveness — no DB check)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.version).toBe('2.0.0');
    expect(res.body.data.timestamp).toBeDefined();
  });
});

describe('GET /api/ready', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with status ready when DB is reachable', async () => {
    const prisma = (await import('../utils/prisma')).default;
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '?column?': 1 }]);

    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.checks.database.ok).toBe(true);
  });

  it('returns 503 with status not_ready when DB is unreachable', async () => {
    const prisma = (await import('../utils/prisma')).default;
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('Connection refused'));

    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.status).toBe('not_ready');
    expect(res.body.data.checks.database.ok).toBe(false);
  });
});
