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
  name: 'HERM Platform',
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
 * `admin` covers super-admins who bypass commercial gates.
 */
export const PAID_TIERS = ['professional', 'enterprise', 'admin'] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

export function isPaidTier(tier: string | undefined | null): boolean {
  if (!tier) return false;
  return (PAID_TIERS as readonly string[]).includes(tier.toLowerCase());
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
