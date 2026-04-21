import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authenticateJWT, requireRole } from '../middleware/auth';
import { requestId } from '../middleware/requestId';
import { errorHandler } from '../middleware/errorHandler';

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());

  app.get('/protected', authenticateJWT, (_req, res) => {
    res.json({ success: true, data: { ok: true } });
  });

  app.get(
    '/admin-only',
    authenticateJWT,
    requireRole(['INSTITUTION_ADMIN']),
    (_req, res) => {
      res.json({ success: true, data: { ok: true } });
    },
  );

  app.use(errorHandler);
  return app;
}

describe('route protection middleware', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(buildApp()).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('returns 401 for a malformed token', async () => {
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 401 when requireRole runs without a user', async () => {
    const res = await request(buildApp()).get('/admin-only');
    expect(res.status).toBe(401);
  });
});
