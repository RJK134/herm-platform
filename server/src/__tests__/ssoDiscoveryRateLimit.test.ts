/**
 * Phase 11.15 (M3) — SSO discovery rate limiter.
 *
 * The two anonymous discovery endpoints (`/api/sso/discover` and
 * `/api/sso/:slug/discover`) used to share the global anonymous bucket
 * with `/api/health` and the auth surface. Phase 11.13 added an
 * `options[]` array per IdP to the response, so an attacker who knows
 * a slug or domain can enumerate the tenant's IdP map. The dedicated
 * `discoveryRateLimiter` (30/min/IP) caps that surface without
 * starving the rest of the anonymous bucket.
 *
 * This test exercises the wiring (a fresh limiter mounted on the same
 * routes), confirming the 429 envelope and that the limiter hits ONLY
 * the discovery routes and not e.g. `/api/sso/sp-metadata.xml`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

import { errorHandler } from '../middleware/errorHandler';
import { requestId } from '../middleware/requestId';

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    institution: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));
vi.mock('../utils/prisma', () => ({ default: prismaMock }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('discoveryRateLimiter — wiring', () => {
  it('429s after the configured ceiling and emits the standard HERM rate-limit envelope', async () => {
    // Build a fast-ceiling limiter so the test stays cheap. The
    // production export uses 30/min; here we use 2 so we hit the
    // boundary in three calls.
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Discovery rate limit exceeded. Please slow down.',
        },
      },
    });

    // Stub the discovery handler with a 200 — we're testing the
    // limiter, not the controller logic (covered in ssoDiscovery.test.ts).
    const app = express();
    app.use(requestId);
    app.get('/api/sso/discover', limiter, (_req, res) => res.json({ ok: true }));
    app.get('/api/sso/:slug/discover', limiter, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const ok1 = await request(app).get('/api/sso/uni/discover');
    const ok2 = await request(app).get('/api/sso/uni/discover');
    const blocked = await request(app).get('/api/sso/uni/discover');
    expect(ok1.status).toBe(200);
    expect(ok2.status).toBe(200);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('the production discoveryRateLimiter export passes a single request through cleanly', async () => {
    const { discoveryRateLimiter } = await import('../middleware/security');
    const app = express();
    app.get('/api/sso/discover', discoveryRateLimiter, (_req, res) => res.json({ ok: true }));
    const res = await request(app).get('/api/sso/discover');
    expect(res.status).toBe(200);
  });

  it('the SSO router mounts the limiter on /discover and /:institutionSlug/discover (and only those)', async () => {
    // Inspect the actual router so this test fails if the production
    // wiring in sso.router.ts changes. We do not need to execute any
    // controller logic; checking the route stack is enough to verify
    // that discoveryRateLimiter is attached to the intended routes.
    // The router is exported as default; destructure to a local name.
    const { default: ssoRouter } = await import('../api/sso/sso.router');
    const { discoveryRateLimiter } = await import('../middleware/security');

    const routeLayers = ((ssoRouter as unknown as { stack?: Array<{ route?: { path?: string; stack?: Array<{ handle: unknown }> } }> }).stack ?? [])
      .filter((layer) => layer.route?.path);

    const routeMiddlewareByPath = new Map(
      routeLayers.map((layer) => [
        layer.route!.path as string,
        (layer.route!.stack ?? []).map((stackLayer) => stackLayer.handle),
      ]),
    );

    expect(routeMiddlewareByPath.get('/discover')).toContain(discoveryRateLimiter);
    // The actual route path uses the parameter name `:institutionSlug`
    // (see sso.router.ts), not `:slug`. Express stores the path with
    // the declared parameter name verbatim.
    expect(routeMiddlewareByPath.get('/:institutionSlug/discover')).toContain(discoveryRateLimiter);
    expect(routeMiddlewareByPath.get('/sp-metadata.xml') ?? []).not.toContain(discoveryRateLimiter);
  });
});
