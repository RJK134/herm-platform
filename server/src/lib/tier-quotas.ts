/**
 * Phase 15.3 — per-tier feature quotas.
 *
 * The numbers here are the runtime enforcement counterpart to the
 * feature-grid copy in `client/src/pages/Subscriptions.tsx`. Keeping
 * them in one server-owned constant means the limits cannot drift
 * between marketing copy and reality, and a single follow-up
 * `/api/tiers/limits` endpoint can render the same source-of-truth to
 * the client without duplicating it in TypeScript on both sides.
 *
 * Metric names use dot-notation (`procurement.projects`, `team.members`)
 * so a future flattening into a generic usage-event table doesn't need
 * a column-name migration — the metric column already holds the
 * fully-qualified key.
 *
 * `'unlimited'` is the explicit sentinel. We deliberately do NOT use
 * `Infinity` because Postgres int4 doesn't store it and we want the
 * read path (`/api/usage`) to render the same value the constants
 * declare, not a JS-engine-specific JSON.stringify quirk.
 */

export type Metric =
  | 'procurement.projects'
  | 'team.members'
  | 'baskets'
  | 'document.generation'
  | 'tco.calculations';

export const METRICS: readonly Metric[] = [
  'procurement.projects',
  'team.members',
  'baskets',
  'document.generation',
  'tco.calculations',
] as const;

type QuotaValue = number | 'unlimited';

// Keys must match the `SubscriptionTier` enum values lowercased — the
// same form `req.user.tier` carries after `authenticateJWT`'s alias
// shim runs (see Phase 15.2).
export const QUOTAS: Record<'free' | 'pro' | 'enterprise', Record<Metric, QuotaValue>> = {
  free: {
    'procurement.projects': 3,
    'team.members': 2,
    'baskets': 3,
    'document.generation': 5,
    'tco.calculations': 10,
  },
  pro: {
    'procurement.projects': 'unlimited',
    'team.members': 10,
    'baskets': 'unlimited',
    'document.generation': 'unlimited',
    'tco.calculations': 'unlimited',
  },
  enterprise: {
    'procurement.projects': 'unlimited',
    'team.members': 'unlimited',
    'baskets': 'unlimited',
    'document.generation': 'unlimited',
    'tco.calculations': 'unlimited',
  },
};

/**
 * Resolve the cap for a tier + metric pair. Unknown tiers default to
 * `free` so a misconfigured JWT can't accidentally lift quotas; callers
 * shouldn't see this path in practice because the auth chain rejects
 * unknown tier claims.
 */
export function quotaFor(tier: string | undefined | null, metric: Metric): QuotaValue {
  const key = (tier ?? 'free').toLowerCase();
  if (key === 'pro' || key === 'enterprise') return QUOTAS[key][metric];
  return QUOTAS.free[metric];
}

/**
 * The YYYY-MM string the UsageCounter table indexes on. UTC so the
 * reset boundary is consistent across customer timezones — the
 * Subscriptions copy says "5/mo" without committing to a local-time
 * window, and a UTC boundary is the only one that's neutral.
 */
export function currentPeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
