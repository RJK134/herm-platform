import type { Request, Response, NextFunction } from 'express';
import prisma from '../../utils/prisma';
import { METRICS, currentPeriod, quotaFor, type Metric } from '../../lib/tier-quotas';

/**
 * Phase 16.8 — `GET /api/usage`.
 *
 * Returns the caller institution's current usage for every quota-tracked
 * metric in the active billing window (UTC YYYY-MM). Powers the
 * client-side "X / Y this month" badges + the QuotaExceededToast's
 * "you have N left" hint.
 *
 * Response shape:
 *   {
 *     success: true,
 *     data: {
 *       tier: 'free' | 'pro' | 'enterprise',
 *       period: '2026-05',
 *       metrics: [
 *         { metric: 'procurement.projects', used: 2, limit: 3 },
 *         { metric: 'baskets',              used: 1, limit: 3 },
 *         …
 *       ]
 *     }
 *   }
 *
 * `limit` is a number for tracked tiers and the literal string
 * `'unlimited'` for Pro/Enterprise where applicable. The string sentinel
 * matches the constant in `tier-quotas.ts` so the client doesn't need
 * a magic-number check; it can render "Unlimited" verbatim.
 *
 * Single Postgres roundtrip — `usageCounter.findMany` filters by
 * `(institutionId, period)` which exactly matches the composite index
 * `UsageCounter_institutionId_period_idx` shipped in #134's migration.
 */
export async function getUsage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const tier = (user.tier ?? 'free').toLowerCase();
    const period = currentPeriod();

    const rows = await prisma.usageCounter.findMany({
      where: { institutionId: user.institutionId, period },
      select: { metric: true, count: true },
    });
    const usedByMetric = new Map<string, number>();
    for (const r of rows) usedByMetric.set(r.metric, r.count);

    const metrics = METRICS.map((metric: Metric) => ({
      metric,
      used: usedByMetric.get(metric) ?? 0,
      limit: quotaFor(tier, metric),
    }));

    res.json({
      success: true,
      data: { tier, period, metrics },
    });
  } catch (err) {
    next(err);
  }
}
