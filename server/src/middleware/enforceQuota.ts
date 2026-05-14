import type { Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { logger } from '../lib/logger';
import { currentPeriod, quotaFor, type Metric } from '../lib/tier-quotas';

/**
 * Phase 15.3 — per-tier quota enforcement.
 *
 * Middleware factory: returns a route-mountable middleware that
 * short-circuits with 402 QUOTA_EXCEEDED when the caller's institution
 * has reached its monthly cap for the given metric. SUPER_ADMIN +
 * `unlimited` tiers pass through without a DB read.
 *
 * Counter increment is intentionally NOT here — incrementing on the
 * "intent to write" path would over-count when the downstream
 * controller subsequently fails (validation, DB constraint, etc.).
 * The controller is responsible for calling `recordUsage()` after its
 * own write succeeds. The brief race between read-cap and
 * write-increment is acceptable: at worst a single user can over-spend
 * by one in a monthly window. The Subscriptions copy says "3 projects",
 * not "3 projects, atomically".
 *
 * 402 (not 403) deliberately: 403 means "you can't do this even with a
 * better plan"; 402 means "this is a billing-resolvable rejection".
 * The client's axios interceptor can route 402 to an UpgradeCard
 * without further sniffing the error code.
 */
export function enforceQuota(metric: Metric) {
  return async function enforceQuotaMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // No user → upstream auth was misconfigured. Refuse closed; surfacing
    // as 401 would mask a programming error.
    const user = req.user;
    if (!user) {
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Quota check ran before auth' },
      });
      return;
    }

    // SUPER_ADMIN bypasses quotas. Platform staff exercise tenant
    // surfaces during impersonation + support; gating those flows on a
    // tenant's quota would be a self-foot-shooting.
    if (user.role === 'SUPER_ADMIN') {
      next();
      return;
    }

    const limit = quotaFor(user.tier, metric);
    if (limit === 'unlimited') {
      next();
      return;
    }

    const period = currentPeriod();
    const row = await prisma.usageCounter.findUnique({
      where: {
        institutionId_metric_period: {
          institutionId: user.institutionId,
          metric,
          period,
        },
      },
      select: { count: true },
    });
    const used = row?.count ?? 0;

    if (used >= limit) {
      logger.info(
        {
          event: 'quota.exceeded',
          userId: user.userId,
          institutionId: user.institutionId,
          metric,
          period,
          used,
          limit,
          tier: user.tier,
        },
        'Quota exceeded',
      );
      res.status(402).json({
        success: false,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `You've reached your ${metric} quota for this billing period`,
          details: { metric, used, limit, tier: user.tier, period },
        },
      });
      return;
    }

    next();
  };
}

/**
 * Increment the usage counter for the caller's institution + metric in
 * the current YYYY-MM window. Designed to be `await`-able from a
 * controller AFTER its primary write has succeeded — calling on the
 * pre-write path leaks count when the controller subsequently 4xx/5xxs.
 *
 * Best-effort: a usage-counter write failure logs and swallows so it
 * never breaks the caller's response. The trade is the same one
 * `audit()` makes — losing a row is regrettable, but failing the user-
 * facing action because the counter write failed would be worse.
 */
export async function recordUsage(
  institutionId: string,
  metric: Metric,
  delta: number = 1,
): Promise<void> {
  if (delta <= 0) return;
  const period = currentPeriod();
  try {
    await prisma.usageCounter.upsert({
      where: {
        institutionId_metric_period: { institutionId, metric, period },
      },
      create: { institutionId, metric, period, count: delta },
      update: { count: { increment: delta } },
    });
  } catch (err) {
    logger.warn(
      {
        event: 'quota.recordUsage.error',
        institutionId,
        metric,
        period,
        err: err instanceof Error ? err.message : String(err),
      },
      'Failed to record usage',
    );
  }
}
