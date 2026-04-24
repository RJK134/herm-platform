# HERM licence compliance

The HERM Platform ships two capability frameworks with different commercial
and licensing characteristics. This document captures the invariants the
code must preserve to remain compliant with the HERM licence and honest
with our customers about what they are paying for.

## Frameworks shipped

| Slug                          | Name                          | Publisher                  | Licence           | Visibility  | Default for |
|-------------------------------|-------------------------------|----------------------------|-------------------|-------------|-------------|
| `herm-v3.1`                   | UCISA HERM v3.1               | CAUDIT                     | CC-BY-NC-SA-4.0   | **Public**  | Free tier   |
| `fhe-capability-framework`    | FHE Capability Framework      | Future Horizons Education  | PROPRIETARY       | Private     | Paid tier   |

Slugs are pinned in `server/src/lib/branding.ts` / `client/src/lib/branding.ts`
and in the Prisma seed (`prisma/seed.ts`). Do not change them without
coordinated updates in all three places plus a data migration for
downstream `Framework.slug` references.

## The two bright-line rules

### 1. HERM capability access is free

Users must never pay to read HERM capability data. Every endpoint
scoped to the HERM framework must be reachable by free-tier and
anonymous callers who request `frameworkId=<herm>` (explicitly or via
the public-framework fallback).

Enforcement:
- `frameworkContext` middleware falls back to the first **public** active
  framework, not `isDefault: true`. This guarantees anonymous callers
  land on HERM, not FHE.
- `tierGate` middleware passes every public framework through
  unconditionally, regardless of user tier.
- The pricing surface (`pages/Subscriptions.tsx`) does not list HERM
  access as a paid feature.

What counts as "HERM capability data":
- the capability catalogue (`Capability`, `FrameworkDomain`),
- raw scores (`CapabilityScore`),
- system-by-capability matrices (leaderboard, heatmap, radar, system
  detail, vendor profile, capability view, capability basket, research
  hub, exports).

### 2. HERM attribution travels with the data

CC-BY-NC-SA-4.0 requires attribution wherever the derivative appears.
Attribution is delivered three ways:

| Surface        | Mechanism                                                                 |
|----------------|---------------------------------------------------------------------------|
| UI (banner)    | `<LicenceAttribution />` on the main HERM pages                           |
| UI (global)    | `<LicenceFooter />` in `AppShell` — persistent one-liner on every page     |
| API (JSON)     | `meta.provenance.framework` block via `lib/provenance.ts::okWithProvenance` |
| API (CSV)      | `x-framework-*` response headers on `/api/export/*`                       |
| Seed / DB      | `Framework.licenceNotice` column carries the canonical attribution text    |
| Compliance doc | This file + `server/src/lib/branding.ts::HERM_LICENCE_NOTICE`              |

The canonical attribution string is the single source in
`server/src/lib/branding.ts::HERM_LICENCE_NOTICE`. It must match the
`Framework.licenceNotice` written by the seed. Keep them in sync.

## Tier classification of API routes

This table is the authoritative mapping. Anything not listed should be
considered free-tier by default; adding a tier gate is a deliberate
compliance action that needs a matching entry here.

### Public (no auth, free tier, no commercial gate)

| Prefix                                                | Why public                                          |
|-------------------------------------------------------|-----------------------------------------------------|
| `/api/health`, `/api/ready`                           | Liveness / readiness                                |
| `/api/auth/*`                                         | Registration + login                                |
| `/api/systems`, `/api/capabilities`, `/api/scores`, `/api/export` | HERM content (framework-scoped, tierGate enforced) |
| `/api/vendors`, `/api/research`, `/api/scoring`, `/api/frameworks` | Reference data, no tenant context        |
| `/api/tco/benchmarks`, `/api/tco/calculate`, `/api/tco/compare`, `/api/integration` | Stateless calculators, free tier |

All framework-scoped responses in this bucket now emit `meta.provenance.framework{…}`, and framework-mappings (enterprise-gated, below) emits a `{source, target}` pair so HERM attribution travels even on the cross-framework surface.

### Authenticated (any tier)

| Prefix                                         | Why auth required                         |
|------------------------------------------------|-------------------------------------------|
| `/api/baskets`                                 | Institutional requirement sets             |
| `/api/chat`                                    | AI assistant + cost attribution            |
| `/api/procurement`, `/api/documents`           | User-owned artefacts, free-tier with usage caps (limits on the Subscriptions page) |
| `/api/architecture`, `/api/value`              | Assessments with tenant scoping            |
| `/api/evaluations`, `/api/vendor-portal`       | Tenant-scoped projects / vendor data       |
| `/api/subscriptions`, `/api/notifications`     | User account & billing                     |
| `/api/institutions`                            | Institution profile                        |
| `/api/tco/estimates`                           | Persisted TCO estimates — both `createdById` and `institutionId` stamped from JWT (never the body); list/read scoped to caller's institutionId |

### Enterprise-tier gated

| Prefix                        | Gate                                     |
|-------------------------------|------------------------------------------|
| `/api/framework-mappings/*`   | `requirePaidTier(['enterprise'])` + per-mapping provenance (`meta.provenance` on `/:id`, `/:id/lookup`; `meta.provenancePairs` on the list endpoint) |
| `/api/keys/*`                 | `requirePaidTier(['enterprise'])`        |

Each gated route is mirrored by a `<RequireTier>` wrapper in the client (see `client/src/components/auth/RequireTier.tsx`) so the paid/free boundary is enforced in the UI as well — anonymous callers bounce to `/login?returnTo=…`, free/professional callers see `<UpgradeCard />`.

### Admin-only

| Prefix          | Gate                                                      |
|-----------------|-----------------------------------------------------------|
| `/api/admin/*`  | `authenticateJWT + requireRole(['INSTITUTION_ADMIN', 'SUPER_ADMIN'])` |

## Error-envelope contract for commercial gates

`requirePaidTier` emits a specific shape so the client can render a
targeted upgrade CTA instead of the generic 403 page:

```json
{
  "success": false,
  "error": {
    "code": "SUBSCRIPTION_REQUIRED",
    "message": "This feature requires an enterprise subscription",
    "details": {
      "requiredTiers": ["enterprise"],
      "currentTier": "professional"
    },
    "requestId": "…"
  }
}
```

Anonymous callers receive a 401 `AUTHENTICATION_ERROR` instead — the
client axios interceptor then clears any stale token and redirects to
`/login?returnTo=…`.

## What's deferred

- **Per-usage limits on calculators**: the Subscriptions page lists
  usage caps (e.g. "TCO calculations: free 10/mo") but these are not
  yet enforced in code. When they are, they belong in domain services
  (not middleware) because free-tier users need the first N requests
  to succeed.
- **Sector analytics tier gating**: `/api/sector/analytics/*` applies a
  minimum-5-institutions k-anonymity filter but no commercial gate.
  Subscription copy does not yet list sector analytics as a paid
  feature; align copy and gate together in a dedicated PR.
- **CSV provenance body**: exports currently only expose provenance via
  `x-framework-*` headers (to avoid polluting the CSV body with
  non-parseable comment lines). If customers ask, we could add a second
  "report" CSV variant with an attribution header row.
- **Capability-mapping exports**: `/api/framework-mappings/:id` exports
  HERM→FHE mappings. These are enterprise-gated but the response does
  not yet carry a provenance block. Follow-up once that becomes a
  data-export surface (today it's a lookup API).

## Navigation and IA

The client navigation is organised around four top-level sections,
defined in `client/src/lib/navigation.ts` (single source of truth for
sidebar, route gating, and this doc):

| Section              | Scope                                                           | Tier visibility                           |
|----------------------|-----------------------------------------------------------------|--------------------------------------------|
| HERM Explorer        | HERM reference data (leaderboard, heatmap, radar, systems, etc.)| Anonymous + all tiers                      |
| Procurement Workspace| Tools, calculators, team workspace, AI                          | Authenticated; free-tier hits usage caps    |
| Sector Intelligence  | Cross-institution analytics + cross-framework mapping            | Professional/Enterprise (per item)          |
| Account & Billing    | Subscription, API keys, vendor portal                            | Authenticated; API keys are Enterprise-only |

Each nav item declares its tier in `navigation.ts`; the sidebar renders a
lock icon and disables routing for items the caller can't reach. Usage
caps for free-tier users (e.g. "up to 3 Procurement Projects") appear in
the hover title on the free tier and disappear on paid tiers.

## Auditing compliance

Before cutting a release:

1. Open the app as an **anonymous** user. Confirm:
   - the Leaderboard, CapabilityView, CapabilityHeatmap, SystemDetail,
     RadarComparison, VendorProfile, ExportDownload surfaces all render
     (HERM Explorer section), each carrying the `<LicenceAttribution />`
     banner or `<LicenceFooter />`,
   - the Account & Billing section is hidden,
   - the Sector Intelligence items show a lock icon and bounce to
     `/login?returnTo=…` when clicked.
2. Open the app as a **free-tier** user. Confirm:
   - the same HERM surfaces remain reachable,
   - clicking Sector Analytics / Framework Mapping / API Integration
     renders the `<UpgradeCard />` rather than the gated page, and the
     upgrade card explicitly notes HERM is unaffected.
3. Open as a **professional-tier** user. Confirm Sector Analytics is
   reachable; Framework Mapping and API Integration still show the card.
4. Open as an **enterprise-tier** user. All four sections are reachable.
5. API-side spot checks:
   - `GET /api/capabilities` returns `meta.provenance.framework.publisher
     = "CAUDIT"` and `licence.type = "CC-BY-NC-SA-4.0"`,
   - `GET /api/export/leaderboard.csv` includes an `x-framework-publisher:
     CAUDIT` response header,
   - `GET /api/framework-mappings/<id>` returns
     `meta.provenance.{source,target}` with source publisher `CAUDIT`,
   - `GET /api/systems?frameworkId=<fhe-id>` as anonymous returns 403
     `AUTHORIZATION_ERROR`,
   - `GET /api/framework-mappings` as a free-tier user returns 403
     `SUBSCRIPTION_REQUIRED` (with `details.requiredTiers: ["enterprise"]`).
6. Spot-check the pricing copy: the Subscriptions page must not
   advertise "HERM" as a paid-only feature.
7. Offline-export checks (PDF / CSV / JSON):
   - Radar Comparison "Export PDF" produces a PDF whose raw stream
     contains the CC-BY-NC-SA licence notice and the publisher name
     (CAUDIT) when the active framework is HERM. The same export
     against a proprietary framework (FHE) omits the CC notice
     (no attribution owed).
   - CSV exports on `/api/export/*` carry the `x-framework-publisher`
     response header as before.
