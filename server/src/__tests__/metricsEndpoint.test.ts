/**
 * Phase 12.2 — `/metrics` endpoint integration test.
 *
 * Mounts a minimal app shape that mirrors the production wiring (early
 * `metricsMiddleware`, then the `/metrics` route) and asserts the
 * scrape contract: 200 + Prometheus text/plain content-type + the
 * herm_ prefix discipline.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { metricsMiddleware } from '../middleware/metrics';
import { __resetMetricsForTests, renderMetrics } from '../lib/metrics';

beforeEach(() => {
  __resetMetricsForTests();
});

function buildApp(): express.Express {
  const app = express();
  app.use(metricsMiddleware);
  app.get('/metrics', async (_req, res, next) => {
    try {
      const body = await renderMetrics();
      res.type('text/plain; version=0.0.4').send(body);
    } catch (err) {
      next(err);
    }
  });
  app.get('/api/sample', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('GET /metrics', () => {
  it('returns 200 with Prometheus text/plain content-type', async () => {
    const res = await request(buildApp()).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    // Prometheus scrapers look for the version 0.0.4 marker.
    expect(res.headers['content-type']).toMatch(/version=0\.0\.4/);
  });

  it('exposes the standard HTTP request counter + histogram', async () => {
    // Drive a few requests so the metrics have non-zero values.
    const app = buildApp();
    await request(app).get('/api/sample');
    await request(app).get('/api/sample');

    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/herm_http_requests_total/);
    expect(res.text).toMatch(/herm_http_request_duration_seconds/);
    expect(res.text).toMatch(/herm_http_requests_in_flight/);
  });

  it('exposes the default Node.js + process metrics under the herm_ prefix', async () => {
    const res = await request(buildApp()).get('/metrics');
    // `prom-client.collectDefaultMetrics({ prefix: 'herm_' })` should
    // emit standard process / nodejs metrics with the prefix applied.
    expect(res.text).toMatch(/herm_process_resident_memory_bytes/);
    expect(res.text).toMatch(/herm_nodejs_eventloop_lag_seconds/);
  });

  it('records its own scrape in the request counter (route="/metrics")', async () => {
    const app = buildApp();
    // First scrape — primes the counter for /metrics itself.
    await request(app).get('/metrics');
    // Second scrape observes the first one.
    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(
      /herm_http_requests_total\{method="GET",route="\/metrics",status="200"\} 1/,
    );
  });
});
