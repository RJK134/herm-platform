import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const queryRaw = vi.fn();
vi.mock('../utils/prisma', () => ({
  default: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

const balanceRetrieve = vi.fn();
const getStripeForHealthCheck = vi.fn();
vi.mock('../services/stripe', () => ({
  getStripeForHealthCheck: () => getStripeForHealthCheck(),
}));

import { liveness, readiness } from '../api/health/health.controller';

function buildApp() {
  const app = express();
  app.get('/api/health', liveness);
  app.get('/api/ready', readiness);
  return app;
}

beforeEach(() => {
  queryRaw.mockReset();
  balanceRetrieve.mockReset();
  getStripeForHealthCheck.mockReset();
});

describe('health endpoints', () => {
  it('GET /api/health returns 200 with status ok', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  // ── DB-only readiness (Stripe not configured) ─────────────────────────────

  it('GET /api/ready returns 200 when the DB responds and Stripe is not configured', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    getStripeForHealthCheck.mockReturnValueOnce(null);
    const res = await request(buildApp()).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.checks.database.ok).toBe(true);
    expect(res.body.data.checks.database.durationMs).toEqual(expect.any(Number));
    // Legacy short flag preserved for back-compat with any external monitors.
    expect(res.body.data.checks.db).toBe('ok');
    // Stripe absent in the response when not configured.
    expect(res.body.data.checks.stripe).toBeUndefined();
  });

  it('GET /api/ready returns 503 when the DB check fails', async () => {
    queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    getStripeForHealthCheck.mockReturnValueOnce(null);
    const res = await request(buildApp()).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.checks.database.ok).toBe(false);
    expect(res.body.data.checks.database.message).toBe('connection refused');
    expect(res.body.data.checks.db).toBe('fail');
  });

  // ── Stripe probe (configured) ─────────────────────────────────────────────

  it('GET /api/ready includes stripe.ok=true when Stripe is configured and reachable', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    balanceRetrieve.mockResolvedValueOnce({ available: [] });
    getStripeForHealthCheck.mockReturnValueOnce({ balance: { retrieve: balanceRetrieve } } as never);
    const res = await request(buildApp()).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.checks.stripe.ok).toBe(true);
    expect(res.body.data.checks.stripe.durationMs).toEqual(expect.any(Number));
    expect(balanceRetrieve).toHaveBeenCalledOnce();
  });

  it('GET /api/ready stays 200 when Stripe fails (informational, not a paging signal)', async () => {
    // Critical contract: a Stripe outage MUST NOT drain pods from rotation.
    // The platform serves HERM/capabilities/procurement without Stripe; only
    // subscription-touching routes need it, and they 503 their own callers.
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    balanceRetrieve.mockRejectedValueOnce(new Error('Stripe is having a bad day'));
    getStripeForHealthCheck.mockReturnValueOnce({ balance: { retrieve: balanceRetrieve } } as never);
    const res = await request(buildApp()).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.checks.database.ok).toBe(true);
    expect(res.body.data.checks.stripe.ok).toBe(false);
    expect(res.body.data.checks.stripe.message).toBe('Stripe is having a bad day');
  });

  it('GET /api/ready returns 503 when DB fails even if Stripe is healthy', async () => {
    queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    balanceRetrieve.mockResolvedValueOnce({ available: [] });
    getStripeForHealthCheck.mockReturnValueOnce({ balance: { retrieve: balanceRetrieve } } as never);
    const res = await request(buildApp()).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.data.checks.database.ok).toBe(false);
    expect(res.body.data.checks.stripe.ok).toBe(true);
  });

  // ── Parallelism + timeout ─────────────────────────────────────────────────

  it('runs DB and Stripe probes in parallel (total time ≈ max, not sum)', async () => {
    queryRaw.mockImplementationOnce(() => new Promise((r) => setTimeout(() => r([1]), 100)));
    balanceRetrieve.mockImplementationOnce(() => new Promise((r) => setTimeout(() => r({}), 100)));
    getStripeForHealthCheck.mockReturnValueOnce({ balance: { retrieve: balanceRetrieve } } as never);
    const start = Date.now();
    const res = await request(buildApp()).get('/api/ready');
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    // Sequential would be ≥200ms; parallel should land near 100ms with a
    // generous ceiling for slow CI machines.
    expect(elapsed).toBeLessThan(180);
  });

  it('Stripe probe handles a synchronous throw from getStripeForHealthCheck without crashing readiness', async () => {
    // Regression: getStripeForHealthCheck() does a dynamic require('stripe')
    // which can throw synchronously if the package is missing while
    // STRIPE_SECRET_KEY is set. The whole probe — including client
    // construction — must run inside the try block so any throw surfaces
    // as ok=false, not an unhandled rejection that crashes /api/ready.
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    getStripeForHealthCheck.mockImplementationOnce(() => {
      throw new Error("Cannot find module 'stripe'");
    });
    const res = await request(buildApp()).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.checks.database.ok).toBe(true);
    expect(res.body.data.checks.stripe.ok).toBe(false);
    expect(res.body.data.checks.stripe.message).toMatch(/Cannot find module 'stripe'/);
  });

  it('Stripe probe times out at 2s and reports as failed (still 200 — informational)', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    // Never-resolving Stripe call. The probe must time out and surface
    // ok=false rather than holding the readiness response open.
    balanceRetrieve.mockImplementationOnce(() => new Promise(() => {}));
    getStripeForHealthCheck.mockReturnValueOnce({ balance: { retrieve: balanceRetrieve } } as never);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const reqPromise = request(buildApp()).get('/api/ready');
      // Advance past the 2s timeout deadline.
      await vi.advanceTimersByTimeAsync(2100);
      const res = await reqPromise;
      expect(res.status).toBe(200);
      expect(res.body.data.checks.stripe.ok).toBe(false);
      expect(res.body.data.checks.stripe.message).toMatch(/timed out/);
    } finally {
      vi.useRealTimers();
    }
  }, 10_000);
});
