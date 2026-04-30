import type { Request, Response } from 'express';
import prisma from '../../utils/prisma';
import * as stripeService from '../../services/stripe';
import { getRedis } from '../../lib/redis';
import { logger } from '../../lib/logger';

const DB_TIMEOUT_MS = 2000;
const STRIPE_TIMEOUT_MS = 2000;
const REDIS_TIMEOUT_MS = 1000;

interface DependencyCheck {
  ok: boolean;
  durationMs: number;
  message?: string;
}

export function liveness(_req: Request, res: Response): void {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
    },
  });
}

/**
 * Wraps a probe promise with a hard timeout so a stuck dependency cannot
 * hold the readiness response open. The timer is unref'd so it doesn't
 * keep the process alive on shutdown.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      const t = setTimeout(() => reject(new Error(`${label} probe timed out after ${ms}ms`)), ms);
      t.unref();
    }),
  ]);
}

async function probeDatabase(): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DB_TIMEOUT_MS, 'database');
    return { ok: true, durationMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      durationMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

/**
 * Probes Stripe with a lightweight `balance.retrieve` call (account-scope,
 * doesn't touch products or prices). Returns `null` when Stripe is not
 * configured on this instance — there's no dependency to probe.
 *
 * The whole probe — including the client-construction step — runs inside
 * the try block. `getStripeForHealthCheck()` calls a dynamic `require('stripe')`
 * which can throw synchronously if the package is missing while
 * `STRIPE_SECRET_KEY` is set. The criticality model guarantees a Stripe
 * issue never crashes /api/ready, so any synchronous throw must surface
 * as `ok: false` rather than propagate up through `Promise.all` as an
 * unhandled rejection.
 */
async function probeStripe(): Promise<DependencyCheck | null> {
  const start = Date.now();
  try {
    const stripe = stripeService.getStripeForHealthCheck();
    if (!stripe) return null;
    await withTimeout(stripe.balance.retrieve(), STRIPE_TIMEOUT_MS, 'stripe');
    return { ok: true, durationMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      durationMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

/**
 * Probes Redis with a `PING` command. Returns null when Redis is not
 * configured on this instance — there's no dependency to probe. Phase
 * 10.6: same informational-only criticality as the Stripe probe — Redis
 * is currently used for nothing user-facing (rate-limit counters fall
 * back to in-process state when Redis is unreachable), so a Redis
 * outage shouldn't drain pods. External monitoring can read
 * `checks.redis.ok` to page on-call.
 */
async function probeRedis(): Promise<DependencyCheck | null> {
  const start = Date.now();
  try {
    const client = getRedis();
    if (!client) return null;
    const result = await withTimeout(client.ping(), REDIS_TIMEOUT_MS, 'redis');
    if (result !== 'PONG') {
      return {
        ok: false,
        durationMs: Date.now() - start,
        message: `unexpected PING reply: ${result}`,
      };
    }
    return { ok: true, durationMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      durationMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

/**
 * Readiness: can this pod serve user traffic?
 *
 * Criticality model:
 *   - DB failure → 503 (pod removed from load-balancer rotation).
 *   - Stripe failure → 200 with `checks.stripe.ok=false` (informational).
 *     A Stripe outage shouldn't drain pods serving HERM, capabilities,
 *     procurement, or sector-analytics — only subscription-touching
 *     routes need Stripe, and those already return 503 to their specific
 *     callers from the controller. External monitoring/alerting can read
 *     `checks.stripe.ok` to page the on-call without taking traffic away.
 *   - Redis failure → 200 with `checks.redis.ok=false` (informational).
 *     Same model as Stripe: Redis isn't user-facing today, so an outage
 *     shouldn't drain pods. Once a session store / shared rate limiter
 *     lands (P10.5), revisit and consider promoting Redis to critical.
 *
 * Probes run in parallel so total response time = max(probe times) ≤ 2s.
 */
export async function readiness(req: Request, res: Response): Promise<void> {
  const [database, stripe, redis] = await Promise.all([probeDatabase(), probeStripe(), probeRedis()]);

  const checks: Record<string, DependencyCheck | string> = {
    database,
    // Legacy short flag — kept for any external monitor that already parses
    // `data.checks.db`. New consumers should read `data.checks.database.ok`.
    db: database.ok ? 'ok' : 'fail',
  };
  if (stripe) checks['stripe'] = stripe;
  if (redis) checks['redis'] = redis;

  const ready = database.ok;

  if (!database.ok) {
    logger.warn(
      { requestId: req.id, err: database.message },
      'readiness: database check failed',
    );
  }
  if (stripe && !stripe.ok) {
    // Logged as info — informational, not paging-grade. Sentry / alerting
    // tooling can subscribe to checks.stripe.ok in the JSON response if it
    // wants to escalate.
    logger.info(
      { requestId: req.id, err: stripe.message, durationMs: stripe.durationMs },
      'readiness: stripe probe failed (informational, not removing pod from rotation)',
    );
  }
  if (redis && !redis.ok) {
    logger.info(
      { requestId: req.id, err: redis.message, durationMs: redis.durationMs },
      'readiness: redis probe failed (informational, not removing pod from rotation)',
    );
  }

  res.status(ready ? 200 : 503).json({
    success: ready,
    data: {
      status: ready ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    },
  });
}
