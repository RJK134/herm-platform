/**
 * Client-side mirror of `server/src/lib/branding.ts`. Keep in sync — see
 * that file for the rationale behind each constant.
 */

export const PRODUCT = {
  name: 'FH Procure',
  longName: 'Future Horizons Procurement Suite',
  vendor: 'Future Horizons Education',
  supportEmail: 'support@futurehorizons.education',
} as const;

export const FRAMEWORK_SLUGS = {
  HERM: 'herm-v3.1',
  FHE: 'fhe-capability-framework',
} as const;

// Must stay in lockstep with server/src/lib/branding.ts — the JWT `tier`
// claim is derived from `Subscription.tier` (FREE | PROFESSIONAL | ENTERPRISE).
// SUPER_ADMIN bypasses are handled server-side via the role claim.
export const PAID_TIERS = ['professional', 'enterprise'] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

export function isPaidTier(tier: string | undefined | null): boolean {
  if (!tier) return false;
  return (PAID_TIERS as readonly string[]).includes(tier.toLowerCase());
}

export function isCcLicence(licenceType: string | null | undefined): boolean {
  if (!licenceType) return false;
  return licenceType.toUpperCase().startsWith('CC-');
}

export const CC_BY_NC_SA_URL = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';
