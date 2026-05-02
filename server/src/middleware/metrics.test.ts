/**
 * Phase 12.2 — middleware tests.
 *
 * Pin the route-label normalisation contract: matched routes use the
 * Express route pattern (`/api/users/:id`), unmatched routes use the
 * `__not_found` sentinel rather than the raw URL.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { metricsMiddleware } from './metrics';
import { __resetMetricsForTests, renderMetrics } from '../lib/metrics';

beforeEach(() => {
  __resetMetricsForTests();
});

function appWithRoutes(): express.Express {
  const app = express();
  app.use(metricsMiddleware);
  app.get('/api/users/:id', (_req, res) => res.json({ ok: true }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/server-error', () => {
    throw new Error('boom');
  });
  // Default 404 handler — Express runs the metrics middleware
  // unconditionally so the unmatched path still gets recorded.
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

describe('metricsMiddleware', () => {
  it('records the matched route pattern, not the raw URL, in the route label', async () => {
    await request(appWithRoutes()).get('/api/users/abc-123');
    const text = await renderMetrics();
    expect(text).toMatch(
      /herm_http_requests_total\{method="GET",route="\/api\/users\/:id",status="200"\} 1/,
    );
    // Negative assertion: the raw ID must not show up anywhere in the
    // metrics output, otherwise we have a cardinality leak.
    expect(text).not.toMatch(/abc-123/);
  });

  it('records `__not_found` for unmatched paths so probe storms do not blow up cardinality', async () => {
    await request(appWithRoutes()).get('/no-such-route-1');
    await request(appWithRoutes()).get('/no-such-route-2');
    const text = await renderMetrics();
    expect(text).toMatch(
      /herm_http_requests_total\{method="GET",route="__not_found",status="404"\} 2/,
    );
    // Negative: neither raw URL appears.
    expect(text).not.toMatch(/no-such-route/);
  });

  it('records the duration histogram for every completed response', async () => {
    await request(appWithRoutes()).get('/api/health');
    const text = await renderMetrics();
    // The exact bucket the request falls in depends on machine speed,
    // but at least the count for the largest bucket (+Inf) must be 1.
    expect(text).toMatch(
      /herm_http_request_duration_seconds_bucket\{le="\+Inf",method="GET",route="\/api\/health",status="200"\} 1/,
    );
  });

  it('records the request even when the handler throws (status 500)', async () => {
    // Express's default error handler responds 500 when no error
    // middleware is installed. The metrics middleware listens on
    // `res.on('finish')`, so the error response is still observed.
    await request(appWithRoutes()).get('/api/server-error');
    const text = await renderMetrics();
    expect(text).toMatch(
      /herm_http_requests_total\{method="GET",route="\/api\/server-error",status="500"\} 1/,
    );
  });

  it('observes exactly once even if both `finish` and `close` fire', async () => {
    // The middleware guards with a `recorded` boolean. Drive a normal
    // request and assert the count is 1, not 2 — this is a regression
    // pin against a future contributor moving the listener registration.
    await request(appWithRoutes()).get('/api/health');
    const text = await renderMetrics();
    const matches = text.match(
      /herm_http_requests_total\{method="GET",route="\/api\/health",status="200"\} 1/g,
    );
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });
});
