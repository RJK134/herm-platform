import type { Request } from 'express';
import helmet from 'helmet';
import rateLimit, { type Options } from 'express-rate-limit';

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-inline' and 'unsafe-eval' removed — XSS protection requires strict CSP.
      // The Vite React frontend injects styles via CSS-in-JS at build time, so no inline
      // scripts are needed at runtime from the API layer. If admin UI adds inline styles
      // later, use a nonce instead of re-enabling 'unsafe-inline'.
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'", 'data:', 'https:'],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many authentication attempts. Please try again in 15 minutes.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Tier-aware API rate limiter ─────────────────────────────────────────────
//
// Phase 9 / Workstream B. Pre-fix the API limiter was a flat 300/min IP-keyed
// cap — paying Enterprise customers got the same ceiling as free-tier
// scrapers. Two design changes here:
//
// 1. **Per-user keying**. `keyGenerator` prefers a stable identifier in this
//    order: API-key id → JWT user id → IP. So an Enterprise user behind a
//    shared NAT isn't sharing a bucket with their colleagues, and an API
//    key gets its own bucket distinct from the human user it was issued to.
//
// 2. **Per-tier ceilings**. `max` reads the caller's tier and returns the
//    matching limit. Defaults below (configurable via env so ops can tune
//    per environment without a deploy).
//
// CRITICAL: this middleware must run AFTER `optionalJWT` so `req.user` is
// populated, and after the API-key middleware so `req.apiUser` is populated.
// app.ts mounts both before the rate limiter — see the comment block there.

const TIER_LIMIT_ANONYMOUS = Number(process.env['RATE_LIMIT_ANONYMOUS'] ?? 100);
const TIER_LIMIT_FREE = Number(process.env['RATE_LIMIT_FREE'] ?? 300);
const TIER_LIMIT_PROFESSIONAL = Number(process.env['RATE_LIMIT_PROFESSIONAL'] ?? 1500);
const TIER_LIMIT_ENTERPRISE = Number(process.env['RATE_LIMIT_ENTERPRISE'] ?? 15000);
const TIER_LIMIT_API_KEY = Number(process.env['RATE_LIMIT_API_KEY'] ?? 600);

/**
 * Returns the per-minute ceiling for this request based on auth context.
 * Exported for testing and so other limiters can share the rule.
 */
export function tieredMax(req: Request): number {
  if (req.apiUser) return TIER_LIMIT_API_KEY;
  const tier = req.user?.tier?.toLowerCase();
  switch (tier) {
    case 'enterprise':
      return TIER_LIMIT_ENTERPRISE;
    case 'professional':
      return TIER_LIMIT_PROFESSIONAL;
    case 'free':
      return TIER_LIMIT_FREE;
    default:
      return TIER_LIMIT_ANONYMOUS;
  }
}

/**
 * Returns the rate-limit bucket key for this request: `apikey:<id>` /
 * `user:<id>` / `ip:<ip>`. Exported for testing.
 */
export function tieredKey(req: Request): string {
  if (req.apiUser) return `apikey:${req.apiUser.id}`;
  if (req.user?.userId) return `user:${req.user.userId}`;
  return `ip:${req.ip ?? 'unknown'}`;
}

const tieredOptions: Partial<Options> = {
  windowMs: 60 * 1000,
  max: tieredMax,
  keyGenerator: tieredKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded for your tier. Slow down or upgrade for a higher quota.',
    },
  },
};

export const apiRateLimiter = rateLimit(tieredOptions);

export const exportRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Export rate limit exceeded.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

export const vendorPortalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Vendor portal rate limit exceeded. Please slow down.' } },
  standardHeaders: true,
  legacyHeaders: false,
});
