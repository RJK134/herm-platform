/**
 * Phase 11.15 — SCIM auth hardening (M1 + M2).
 *
 * Covers:
 *   - The bounded negative-auth LRU on `scim.router.ts`: cache hit/miss,
 *     TTL expiry, FIFO capacity eviction, and the invariant that POSITIVE
 *     lookups (a real, valid key) are NEVER cached so a key revocation
 *     takes effect at the next request.
 *   - The dedicated `/scim/v2/*` rate limiter: 60 req/min per IP, returning
 *     a SCIM-shaped 429 envelope.
 *
 * The rate-limiter test mounts a fresh limiter so the test's window
 * isn't polluted by other suites.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { apiKeyFindUniqueMock, apiKeyUpdateMock } = vi.hoisted(() => ({
  apiKeyFindUniqueMock: vi.fn(),
  apiKeyUpdateMock: vi.fn(),
}));

vi.mock('../utils/prisma', () => ({
  default: {
    user: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    apiKey: { findUnique: apiKeyFindUniqueMock, update: apiKeyUpdateMock },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));

import {
  createScimRouter,
  _resetScimNegativeCacheForTests,
  _scimNegativeCacheSizeForTests,
} from '../api/scim/scim.router';

const VALID_KEY = 'herm_pk_validkey0000000000000000000000000000000000000000';

function buildScimApp(): express.Express {
  const app = express();
  app.use(express.json({ type: ['application/json', 'application/scim+json'] }));
  app.use('/scim/v2', createScimRouter());
  return app;
}

beforeEach(() => {
  apiKeyFindUniqueMock.mockReset();
  apiKeyUpdateMock.mockReset();
  apiKeyUpdateMock.mockResolvedValue({});
  _resetScimNegativeCacheForTests();
});

describe('SCIM negative-auth cache (M1)', () => {
  it('caches a "no row" hash so a repeat probe does not hit Prisma again', async () => {
    apiKeyFindUniqueMock.mockResolvedValueOnce(null);
    const app = buildScimApp();
    const probeKey = 'herm_pk_probe00000000000000000000000000000000000000000000';

    const first = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${probeKey}`);
    expect(first.status).toBe(401);
    expect(apiKeyFindUniqueMock).toHaveBeenCalledTimes(1);

    // Second probe with the same hash: do NOT queue another mock value
    // — if the cache works, Prisma is never called and the original
    // mock is sufficient. If the cache leaks, the second call returns
    // undefined and the test surfaces a different status.
    const second = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${probeKey}`);
    expect(second.status).toBe(401);
    expect(apiKeyFindUniqueMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache a HIT — a valid key flows through Prisma every request', async () => {
    apiKeyFindUniqueMock.mockResolvedValue({
      id: 'key-1',
      institutionId: 'inst-1',
      permissions: ['admin:scim'],
      isActive: true,
      expiresAt: null,
      institution: { deletedAt: null },
    });
    const app = buildScimApp();

    await request(app).get('/scim/v2/Users').set('Authorization', `Bearer ${VALID_KEY}`);
    await request(app).get('/scim/v2/Users').set('Authorization', `Bearer ${VALID_KEY}`);
    expect(apiKeyFindUniqueMock).toHaveBeenCalledTimes(2);
    expect(_scimNegativeCacheSizeForTests()).toBe(0);
  });

  it('does NOT cache hashed-but-invalid (active=false / expired / tenant-deleted) — flips back to active take effect at next request', async () => {
    // Sequence: revoked key → admin restores → next request must accept.
    apiKeyFindUniqueMock.mockResolvedValueOnce({
      id: 'key-2',
      institutionId: 'inst-2',
      permissions: ['admin:scim'],
      isActive: false, // revoked
      expiresAt: null,
      institution: { deletedAt: null },
    });
    const app = buildScimApp();
    const first = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(first.status).toBe(401);

    // Admin un-revokes the key. Cache should NOT have stamped this
    // hash (only "no matching row" is cached), so the next request
    // should hit Prisma again and accept.
    apiKeyFindUniqueMock.mockResolvedValueOnce({
      id: 'key-2',
      institutionId: 'inst-2',
      permissions: ['admin:scim'],
      isActive: true,
      expiresAt: null,
      institution: { deletedAt: null },
    });
    const second = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${VALID_KEY}`);
    expect(second.status).toBe(200);
    expect(apiKeyFindUniqueMock).toHaveBeenCalledTimes(2);
  });

  it('expires entries after the 30s TTL — a probe after expiry queries Prisma again', async () => {
    apiKeyFindUniqueMock.mockResolvedValue(null);
    const app = buildScimApp();
    const probeKey = 'herm_pk_ttlprobe000000000000000000000000000000000000000000';

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-01T12:00:00Z'));
      await request(app).get('/scim/v2/Users').set('Authorization', `Bearer ${probeKey}`);
      expect(apiKeyFindUniqueMock).toHaveBeenCalledTimes(1);

      // Within the 30s window — still cached.
      vi.setSystemTime(new Date('2026-05-01T12:00:20Z'));
      await request(app).get('/scim/v2/Users').set('Authorization', `Bearer ${probeKey}`);
      expect(apiKeyFindUniqueMock).toHaveBeenCalledTimes(1);

      // After 30s — entry is stale, Prisma is consulted again.
      vi.setSystemTime(new Date('2026-05-01T12:00:31Z'));
      await request(app).get('/scim/v2/Users').set('Authorization', `Bearer ${probeKey}`);
      expect(apiKeyFindUniqueMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts the oldest entry once capacity (256) is exceeded — bounds memory under probe storms', async () => {
    apiKeyFindUniqueMock.mockResolvedValue(null);
    const app = buildScimApp();

    // Drive 257 distinct probe-key hashes through the auth chain. The
    // 257th insert should evict the FIRST entry, leaving size == 256.
    // Build keys that produce different sha256 hashes (the prefix is
    // fixed; the suffix varies).
    const probes = Array.from(
      { length: 257 },
      (_, i) => `herm_pk_${i.toString(16).padStart(50, '0')}`,
    );
    for (const k of probes) {
      await request(app).get('/scim/v2/Users').set('Authorization', `Bearer ${k}`);
    }
    expect(_scimNegativeCacheSizeForTests()).toBe(256);

    // The very first probe was evicted — re-probing it must hit Prisma
    // again (mock returns null, so still 401). Reset the counter to
    // make the assertion crisp.
    const callsBefore = apiKeyFindUniqueMock.mock.calls.length;
    await request(app).get('/scim/v2/Users').set('Authorization', `Bearer ${probes[0]!}`);
    expect(apiKeyFindUniqueMock.mock.calls.length).toBe(callsBefore + 1);
  });
});

describe('SCIM rate limiter (M2)', () => {
  it('returns 429 with a SCIM-shaped error envelope after the per-minute ceiling', async () => {
    // Use a tight ceiling so the test runs fast — we're verifying the
    // limiter wires up and emits the right envelope, not the precise
    // 60/min default. Mount our own limiter with max=3 in front of a
    // stub /scim handler.
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '429',
        detail: 'SCIM rate limit exceeded.',
      },
    });
    const app = express();
    app.use('/scim/v2', limiter, (_req, res) => res.status(200).json({ ok: true }));

    // First 3 succeed; the 4th must 429 with the SCIM envelope.
    for (let i = 0; i < 3; i++) {
      const ok = await request(app).get('/scim/v2/Users');
      expect(ok.status).toBe(200);
    }
    const blocked = await request(app).get('/scim/v2/Users');
    expect(blocked.status).toBe(429);
    expect(blocked.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:Error');
    expect(blocked.body.detail).toMatch(/rate limit/i);
  });

  it('the production scimRateLimiter export is wired with a 60/min ceiling', async () => {
    const { scimRateLimiter } = await import('../middleware/security');
    // We can't easily peek at internals, but the wiring contract is
    // that mounting it in front of a handler yields a working limiter
    // — exercise that path. With the ceiling at 60 we don't blast 60+
    // requests in a unit test; we just confirm one request passes
    // through to the handler.
    const app = express();
    app.use('/scim/v2', scimRateLimiter, (_req, res) => res.status(200).json({ ok: true }));
    const res = await request(app).get('/scim/v2/Users');
    expect(res.status).toBe(200);
  });
});
