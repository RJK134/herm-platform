/**
 * Phase 11.9 — soft-delete session revocation pin.
 *
 * Opts in to the `ENABLE_SOFT_DELETE_AUTH_CHECK` env knob (which is
 * off by default in test mode for the rest of the suite — see
 * middleware/auth.ts) and verifies that:
 *
 *   1. A live user with deletedAt=null passes auth normally.
 *   2. A user whose deletedAt has been stamped is rejected with the
 *      generic 401, even with an otherwise-valid JWT.
 *   3. The cache amortises repeat checks to a single Prisma round-trip
 *      per user per TTL window — verified by call-count.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { findUniqueMock } = vi.hoisted(() => ({ findUniqueMock: vi.fn() }));
vi.mock('../utils/prisma', () => ({
  default: {
    user: { findUnique: findUniqueMock },
  },
}));

import { authenticateJWT, _resetSoftDeleteCacheForTests } from '../middleware/auth';
import { errorHandler } from '../middleware/errorHandler';
import { requestId } from '../middleware/requestId';

const SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';

function tokenFor(userId: string): string {
  return jwt.sign(
    {
      userId,
      email: `${userId}@uni.test`,
      name: 'Test User',
      role: 'VIEWER',
      institutionId: 'inst-1',
      institutionName: 'Test Inst',
      tier: 'enterprise',
    },
    SECRET,
  );
}

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(authenticateJWT);
  app.get('/probe', (req, res) => {
    res.json({ success: true, userId: req.user?.userId });
  });
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  process.env['ENABLE_SOFT_DELETE_AUTH_CHECK'] = 'true';
  findUniqueMock.mockReset();
  _resetSoftDeleteCacheForTests();
});

afterEach(() => {
  delete process.env['ENABLE_SOFT_DELETE_AUTH_CHECK'];
  _resetSoftDeleteCacheForTests();
});

describe('authenticateJWT — soft-delete revocation', () => {
  it('lets a live user through (deletedAt = null)', async () => {
    findUniqueMock.mockResolvedValue({ deletedAt: null });
    const res = await request(buildApp())
      .get('/probe')
      .set('Authorization', `Bearer ${tokenFor('u-live')}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('u-live');
  });

  it('rejects a soft-deleted user with the generic 401', async () => {
    findUniqueMock.mockResolvedValue({ deletedAt: new Date('2026-04-01T00:00:00Z') });
    const res = await request(buildApp())
      .get('/probe')
      .set('Authorization', `Bearer ${tokenFor('u-deleted')}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    // The 401 message must NOT leak "soft-deleted" — same string the
    // expired-token path uses.
    expect(res.body.error.message).toBe('Invalid or expired token');
  });

  it('treats a hard-deleted user (row not found) as live (existing JWT keeps working until expiry)', async () => {
    findUniqueMock.mockResolvedValue(null);
    const res = await request(buildApp())
      .get('/probe')
      .set('Authorization', `Bearer ${tokenFor('u-hard-deleted')}`);
    expect(res.status).toBe(200);
  });

  it('caches the result — only ONE Prisma round-trip across many requests for the same user', async () => {
    findUniqueMock.mockResolvedValue({ deletedAt: null });
    const app = buildApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .get('/probe')
        .set('Authorization', `Bearer ${tokenFor('u-cached')}`);
      expect(res.status).toBe(200);
    }
    expect(findUniqueMock).toHaveBeenCalledTimes(1);
  });
});
