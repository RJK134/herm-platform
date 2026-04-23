import type { Request, Response, NextFunction } from 'express';
import { PAID_TIERS } from '../lib/branding';
import type { PaidTier } from '../lib/branding';

/**
 * Gates a commercial feature behind a subscription tier.
 *
 * Unlike `tierGate` — which gates framework *data* (HERM vs proprietary FHE)
 * — this middleware gates proprietary *features* (API keys, framework
 * mapping, sector analytics, etc.) regardless of which framework is being
 * read. Callers that only look at HERM content must never be gated here.
 *
 * Contract:
 *   - A valid JWT is required. Anonymous callers get 401.
 *   - `SUPER_ADMIN` bypasses the tier check entirely.
 *   - By default, any tier in `PAID_TIERS` passes.
 *   - Pass an explicit `tiers` array to require a specific plan
 *     (e.g. `requirePaidTier(['enterprise'])` for enterprise-only gates).
 *
 * Returns `403 SUBSCRIPTION_REQUIRED` with the list of eligible tiers so
 * the client can render a targeted upgrade CTA.
 */
export function requirePaidTier(tiers: readonly (PaidTier | string)[] = PAID_TIERS) {
  const allowed = new Set(tiers.map((t) => t.toLowerCase()));

  return function requirePaidTierMiddleware(req: Request, res: Response, next: NextFunction): void {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Authentication required for this feature',
          requestId: req.id,
        },
      });
      return;
    }

    if (user.role === 'SUPER_ADMIN') {
      next();
      return;
    }

    const tier = (user.tier ?? '').toLowerCase();
    if (allowed.has(tier)) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      error: {
        code: 'SUBSCRIPTION_REQUIRED',
        message: `This feature requires a ${[...allowed].join(' or ')} subscription`,
        details: { requiredTiers: [...allowed], currentTier: tier || 'free' },
        requestId: req.id,
      },
    });
  };
}
