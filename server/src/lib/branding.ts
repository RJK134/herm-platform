/**
 * Single source of truth for product, framework, and licence branding on
 * the server. Mirror any changes in `client/src/lib/branding.ts`.
 *
 * Why this file exists:
 *  - We ship two frameworks: the CC-BY-NC-SA HERM reference model (free,
 *    must carry attribution) and the proprietary FHE Capability Framework
 *    (paid). Keeping slugs, publishers, and tier predicates in one place
 *    prevents silently mis-labelling which dataset a caller is reading.
 *  - Compliance-critical strings (the HERM attribution notice, the CC
 *    licence URL) must never drift between seed data, API responses, and
 *    UI copy. Constants here are consumed by middleware, response
 *    shapers, and the eventual HERM_COMPLIANCE audit.
 */

// ── Product ──────────────────────────────────────────────────────────────────

export const PRODUCT = {
  /**
   * Short product name — used in chrome, OTP issuer, email signatures,
   * sidebar footer, OpenAPI title. Phase 15.1 rebrand: "Future Horizons
   * ASPT" → "FH Procure". HERM-emphasised branding moved into
   * dataset-attribution copy (HERM_LICENCE_NOTICE below) — the product
   * is the procurement suite, HERM is the included free reference
   * model.
   */
  name: 'FH Procure',
  /**
   * Full product name — used where the short form would feel cryptic:
   * legal headers (PDF cover, email signatures, OpenAPI contact, Trust
   * Centre title), and any place an enterprise procurement reviewer
   * needs the full vendor identity at a glance.
   */
  longName: 'Future Horizons Procurement Suite',
  vendor: 'Future Horizons Education',
  supportEmail: 'support@futurehorizons.education',
} as const;

// ── Framework slugs (pinned — used by seed + tier logic) ────────────────────

export const FRAMEWORK_SLUGS = {
  /** UCISA HERM v3.1 — CC-BY-NC-SA-4.0. Must always stay free-tier-accessible. */
  HERM: 'herm-v3.1',
  /** FHE Capability Framework — proprietary. Paid-tier default. */
  FHE: 'fhe-capability-framework',
} as const;

// ── Tier predicates ──────────────────────────────────────────────────────────

/**
 * Subscription tiers that grant access to proprietary (non-public)
 * frameworks and paid-only features. Lowercased to match the JWT `tier`
 * claim emitted by `/api/auth/login` and `/api/auth/register`.
 *
 * The values here must stay in lockstep with the `Subscription.tier`
 * enum in `prisma/schema.prisma` (`FREE | PRO | ENTERPRISE`).
 * SUPER_ADMIN is intentionally not a tier — platform-wide bypasses go
 * through an explicit `user.role === 'SUPER_ADMIN'` check in
 * `requirePaidTier`, not by polluting this list with a synthetic value.
 *
 * Phase 15.2 renamed the middle tier from `professional` → `pro`. The
 * old value is preserved as a JWT-claim alias (see
 * `LEGACY_TIER_ALIASES` below + the shim in
 * `middleware/auth.ts::authenticateJWT`) so users carrying
 * pre-rebrand tokens keep working until natural expiry.
 */
export const PAID_TIERS = ['pro', 'enterprise'] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

/**
 * Stale-token aliases. A JWT minted before Phase 15.2 carries
 * `tier: 'professional'`; `authenticateJWT` rewrites it to `'pro'`
 * before assigning to `req.user.tier` so `requirePaidTier(['pro'])`
 * admits it transparently. Removable once live JWT TTLs have rotated
 * past the rebrand deploy (see RUNBOOK § "Tier-alias deprecation").
 */
export const LEGACY_TIER_ALIASES: Record<string, string> = {
  professional: 'pro',
};

export function isPaidTier(tier: string | undefined | null): boolean {
  if (!tier) return false;
  return (PAID_TIERS as readonly string[]).includes(tier.toLowerCase());
}

/**
 * Normalises a tier string by collapsing legacy aliases. Idempotent;
 * unknown values pass through unchanged so a malformed JWT still
 * fails the downstream tier check the same way it did before.
 */
export function normaliseTier(tier: string | undefined | null): string {
  if (!tier) return '';
  const lower = tier.toLowerCase();
  return LEGACY_TIER_ALIASES[lower] ?? lower;
}

// ── Licence helpers ──────────────────────────────────────────────────────────

/**
 * Returns true if a licenceType string denotes a Creative Commons licence
 * that requires attribution (CC-BY-*, CC-BY-NC-SA-*, …). Proprietary
 * licences return false.
 */
export function isCcLicence(licenceType: string | null | undefined): boolean {
  if (!licenceType) return false;
  return licenceType.toUpperCase().startsWith('CC-');
}

/**
 * Canonical HERM attribution notice. This is embedded into:
 *  - the Framework.licenceNotice column at seed time,
 *  - API provenance blocks emitted by `respond.ts::okWithProvenance`,
 *  - the UI banner rendered by `<LicenceAttribution />`.
 *
 * Do not reword in one place without updating the others.
 */
export const HERM_LICENCE_NOTICE =
  'This work is based on the UCISA Higher Education Reference Model (HERM) v3.1, ' +
  'published by the Council of Australasian University Directors of Information ' +
  'Technology (CAUDIT) and licensed under the Creative Commons Attribution-' +
  'NonCommercial-ShareAlike 4.0 International License.';

export const CC_BY_NC_SA_URL = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';
