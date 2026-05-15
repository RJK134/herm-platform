/**
 * Client-side mirror of `server/src/lib/branding.ts`. Keep in sync — see
 * that file for the rationale behind each constant.
 */

export const PRODUCT = {
  name: 'FHE Procurement Platform',
  longName: 'Future Horizons Education Procurement Platform',
  vendor: 'Future Horizons Education',
  supportEmail: 'support@futurehorizons.education',
} as const;

export const FRAMEWORK_SLUGS = {
  HERM: 'herm-v3.1',
  FHE: 'fhe-capability-framework',
} as const;

// Must stay in lockstep with server/src/lib/branding.ts — the JWT `tier`
// claim is derived from `Subscription.tier` (FREE | PRO | ENTERPRISE).
// SUPER_ADMIN bypasses are handled server-side via the role claim.
//
// Phase 15.2 renamed the middle tier from `professional` → `pro`. The
// server's `authenticateJWT` rewrites stale `professional` claims to
// `pro` in-place; `normaliseTier` mirrors that on the client so
// localStorage tokens carrying the legacy claim still render the
// right UI affordances until natural expiry.
export const PAID_TIERS = ['pro', 'enterprise'] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

const LEGACY_TIER_ALIASES: Record<string, string> = {
  professional: 'pro',
};

export function isPaidTier(tier: string | undefined | null): boolean {
  if (!tier) return false;
  return (PAID_TIERS as readonly string[]).includes(normaliseTier(tier));
}

/** Maps legacy tier claims to their canonical name. Idempotent. */
export function normaliseTier(tier: string | undefined | null): string {
  if (!tier) return '';
  const lower = tier.toLowerCase();
  return LEGACY_TIER_ALIASES[lower] ?? lower;
}

export function isCcLicence(licenceType: string | null | undefined): boolean {
  if (!licenceType) return false;
  return licenceType.toUpperCase().startsWith('CC-');
}

export const CC_BY_NC_SA_URL = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';
