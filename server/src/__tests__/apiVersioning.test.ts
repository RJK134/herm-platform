/**
 * Phase 10.4: API versioning (`/api/v1/*`) + OpenAPI spec.
 *
 * Pins:
 *   - Every existing route under `/api/*` is also reachable under
 *     `/api/v1/*`, with identical behaviour.
 *   - `GET /api/openapi.json` returns a valid OpenAPI 3.1 spec listing
 *     the public surface, with stable `info.version` and the dual-base
 *     `servers` block.
 *   - The same spec is served at `/api/v1/openapi.json` (so a client
 *     pinned to v1 can self-discover).
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import openApiRouter from '../api/openapi/openapi.router';
import healthRouter from '../api/health/health.router';

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Health controller hits prisma + stripe; mock both so the alias test
// doesn't need a live DB.
vi.mock('../utils/prisma', () => ({
  default: { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) },
}));
vi.mock('../services/stripe', () => ({
  getStripeForHealthCheck: () => null,
}));

function buildAppForOpenapi() {
  const app = express();
  app.use('/api', openApiRouter);
  app.use('/api/v1', openApiRouter);
  return app;
}

describe('GET /api/openapi.json', () => {
  it('returns a valid OpenAPI 3.1 envelope with the expected info + servers blocks', async () => {
    const res = await request(buildAppForOpenapi()).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    // Phase 15.1 rebrand: OpenAPI title is now "FH Procure API" (was
    // "HERM Platform API"). HERM remains the included reference model,
    // not the product identity.
    expect(res.body.info.title).toMatch(/FH Procure/i);
    expect(res.body.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    const serverUrls = (res.body.servers as Array<{ url: string }>).map((s) => s.url);
    expect(serverUrls).toContain('/api/v1');
    expect(serverUrls).toContain('/api');
  });

  it('lists the core public endpoints under paths', async () => {
    const res = await request(buildAppForOpenapi()).get('/api/openapi.json');
    const paths = Object.keys(res.body.paths as Record<string, unknown>);
    for (const expected of [
      '/health',
      '/ready',
      '/auth/login',
      '/auth/register',
      '/auth/me',
      '/capabilities',
      '/systems',
      '/baskets',
      '/sector/analytics/overview',
      '/subscriptions/checkout',
    ]) {
      expect(paths, `expected ${expected} in spec.paths`).toContain(expected);
    }
  });

  it('exposes BearerJWT and ApiKey security schemes with the expected shape', async () => {
    const res = await request(buildAppForOpenapi()).get('/api/openapi.json');
    const schemes = res.body.components.securitySchemes as Record<string, { scheme: string; bearerFormat?: string }>;
    expect(schemes['BearerJWT']).toEqual(
      expect.objectContaining({ scheme: 'bearer', bearerFormat: 'JWT' }),
    );
    expect(schemes['ApiKey']).toEqual(
      expect.objectContaining({ scheme: 'bearer' }),
    );
  });

  it('sets a Cache-Control header so codegen / gateways can cache the spec', async () => {
    const res = await request(buildAppForOpenapi()).get('/api/openapi.json');
    expect(res.headers['cache-control']).toMatch(/max-age=\d+/);
  });

  it('serves the same spec under /api/v1/openapi.json', async () => {
    const a = await request(buildAppForOpenapi()).get('/api/openapi.json');
    const b = await request(buildAppForOpenapi()).get('/api/v1/openapi.json');
    expect(b.status).toBe(200);
    expect(b.body.openapi).toBe(a.body.openapi);
    expect(b.body.info.version).toBe(a.body.info.version);
    expect(Object.keys(b.body.paths)).toEqual(Object.keys(a.body.paths));
  });
});

describe('/api/v1 alias parity', () => {
  function buildDualMountedApp() {
    const app = express();
    // Mirror app.ts: mount the same router at both bases.
    for (const base of ['/api', '/api/v1'] as const) {
      app.use(base, healthRouter);
    }
    return app;
  }

  it('GET /api/health and /api/v1/health return identical 200 status payloads', async () => {
    const app = buildDualMountedApp();
    const a = await request(app).get('/api/health');
    const b = await request(app).get('/api/v1/health');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // Don't assert deep equality on the payload — uptime drifts. Pin the
    // envelope shape instead: success flag + data.status both match.
    expect(a.body.success).toBe(true);
    expect(b.body.success).toBe(true);
    expect(b.body.data?.status).toBe(a.body.data?.status);
  });
});
