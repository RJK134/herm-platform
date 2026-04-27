# Overnight stabilisation pass — progress report

**Branch:** `claude/stability-improvements-bj0tB` (initial pass) → split per-item branches for follow-ups
**Initial pass:** 2026-04-25
**Last updated:** 2026-04-27
**Scope:** Tightly-scoped route auth / tier enforcement + HERM compliance hardening; no architectural rewrites.

## Source-of-truth note

The brief referenced `FH_ASPT_REDESIGN_BRIEF.md § 4.2`, which is not present in
this repository. The audit therefore treats `HERM_COMPLIANCE.md` ("Tier
classification of API routes") and `ARCHITECTURE_NOTES.md` ("Route auth matrix
(current)") as the canonical route-tier matrix. They are internally consistent;
when a conflict exists, `HERM_COMPLIANCE.md` wins (per its own preamble).

If the FH_ASPT brief becomes available, re-audit against § 4.2 specifically and
reconcile any divergence with the choices below.

## Routes audited

Every prefix mounted in `server/src/app.ts` (lines 54–90) was checked against
the canonical matrix. Compliant prefixes (no fix required):

`/api/health`, `/api/ready`, `/api/auth/*`, `/api/institutions/*`,
`/api/systems`, `/api/capabilities`, `/api/scores`, `/api/export`,
`/api/vendors`, `/api/research`, `/api/scoring`, `/api/chat`,
`/api/baskets`, `/api/tco`, `/api/procurement`, `/api/integration`
(now also tenant-scoped — see below), `/api/vendor-portal`,
`/api/evaluations`, `/api/admin`, `/api/sector/analytics`
(tier-gating still deferred), `/api/keys`, `/api/frameworks`,
`/api/framework-mappings`.

## Discrepancies — disposition

| # | Severity | Prefix | Disposition |
|---|---|---|---|
| 1 | 🔴 HIGH | `/api/subscriptions/{checkout,status,cancel,invoices}` — `optionalJWT` allowed anonymous callers; `createCheckout` would create orphan Stripe sessions with `institutionId=undefined`. | ✅ **Fixed (PR #30, merged).** Router-level `authenticateJWT` after the webhook; controllers now read `req.user.institutionId` directly. |
| 2 | 🟠 MED | `/api/architecture/*`, `/api/value/*`, `/api/documents/*` mutations — `optionalJWT` only; controllers silently accepted writes with no `institutionId`. | ✅ **Fixed (PR #30).** Stateless previews keep `optionalJWT`; persisted POST/GET/PATCH/DELETE require JWT. |
| 3 | 🟡 LOW-MED | `/api/notifications` — anonymous PATCH `/:id/read` could flip another user's notification. | ✅ **Fixed (PR #30).** Router requires `authenticateJWT`; PATCH switched to `updateMany` scoped by `{ id, userId }` with a 404 envelope on count=0. |
| 4 | 🟠 MED | **Cross-tenant reads on persisted artefacts** — `listDocuments`, `getDocument`, `updateDocument`, `deleteDocument`, `getAssessment`, `listAssessments`, `getAnalysis`, `listAnalyses`, integration list/get all ran unscoped Prisma queries. Tenant A could read or mutate tenant B's rows by id-guessing. | ✅ **Fixed (PR #31, merged).** Every list/get/update/delete now takes an explicit `institutionId` parameter and uses `findFirst({ id, institutionId })` / `updateMany`/`deleteMany({ id, institutionId })` for atomic gating. Wrong-owner ids surface as 404, never 403. New `IntegrationAssessment.institutionId` column (additive, indexed migration). `/api/integration` newly gated with `authenticateJWT`. 16 new tenant-isolation tests. |
| 5 | 🟠 MED | **Stripe webhook raw-body parsing** — `app.use(express.json())` registered globally before any route, consuming the body before the per-route `express.raw()` could run. Webhook handler received a parsed object cast to Buffer; Stripe signature verification would throw in production. | ✅ **Fixed (PR #32, merged).** Path-scoped `app.use('/api/subscriptions/webhook', express.raw(...))` registered BEFORE the global `express.json()`. Per-route `express.raw()` removed from router. New regression-guard test asserts `Buffer.isBuffer(req.body)` and raw bytes match payload. |
| 5b | 🟢 INFO | `updateDocument` follow-ups (caught by Cursor Bugbot mid-review on PR #32) | ✅ **Fixed (in PR #32).** Three defense-in-depth tightenings: (a) `update({where:{id}})` → `updateMany({where:{id,institutionId}})` atomic gate; (b) re-read switched to `findFirst({where:{id,institutionId}})`; (c) null-guard on the re-read against concurrent-delete race, preserving the prior non-null contract. |
| 6 | 🟢 INFO | `/api/sector/analytics/*` `optionalJWT` only. | ⏳ **Still deferred** — see follow-up #1 below. Now queued for the next session. |
| 7 | (release-discipline) | Three duplicate `import { PRODUCT } from '.../branding'` statements from commit `b93f3c9` blocking `npm run typecheck` and 15 vitest test-file transforms. | ✅ **Fixed (PR #30).** Single-line dedupes. |

## Code changes (cumulative across PRs #30–#32)

PR #30 (route control + tier enforcement)
- `server/src/api/subscriptions/subscriptions.router.ts` — `authenticateJWT` (after webhook).
- `server/src/api/subscriptions/subscriptions.controller.ts` — drop anonymous fallbacks.
- `server/src/api/{architecture,value,documents}/{*}.router.ts` — public stateless previews; JWT-gated persisted ops.
- `server/src/api/notifications/notifications.router.ts` — `authenticateJWT`; `userId`-scoped PATCH.
- Three duplicate-`PRODUCT` import dedupes.

PR #31 (tenant isolation)
- `prisma/migrations/20260426000000_integration_assessment_institution_id/migration.sql` — additive, indexed.
- `prisma/schema.prisma` — `IntegrationAssessment.institutionId` (nullable, indexed).
- Service+controller plumbing for `institutionId` across documents / architecture / value / integration.
- `/api/integration` newly gated with `authenticateJWT`.

PR #32 (Stripe webhook)
- `server/src/app.ts` — path-scoped `express.raw()` before global `express.json()`.
- `server/src/api/subscriptions/subscriptions.router.ts` — drop redundant per-route raw parser.
- `subscriptions.router.test.ts` — buildApp() mirrors new order; new Buffer regression guard.
- `documents.service.ts::updateDocument` — atomic `updateMany`, scoped re-read with null-guard.

## Tests added (cumulative)

| File | Tests |
|---|---|
| `subscriptions.router.test.ts` | 8 (PR #30 added 7, PR #32 added the Buffer regression guard) |
| `tierControl.test.ts` | 14 |
| `persistedArtefactsAuth.test.ts` | 12 |
| `tenantIsolation.test.ts` | 18 (PR #31 added 16, PR #32's bot follow-ups added 2: own-id PATCH atomicity assertion and concurrent-delete race-loss) |

**Server suite:** 322 / 322 passing (was 271 pre-pass). **Client suite:** 64 / 64 unchanged.

## Verify state

```
npm run verify  →  PASS at every merge point
                   lint:       0 errors / 120 pre-existing warnings
                   typecheck:  clean
                   tests:      322 server + 64 client
                   build:      OK
```

## Unresolved follow-ups

1. **`/api/sector/analytics/*` tier gating.** Currently `optionalJWT` + k-anon only. `HERM_COMPLIANCE.md` "What's deferred" calls this out; `Subscriptions.tsx` does not yet list it as a paid-only feature. Align gate + pricing copy in a dedicated PR. **Now queued for the next session.**

2. **CI workflow trigger gap.** `.github/workflows/ci.yml` is gated on `pull_request: branches: [main, develop]`. Neither branch exists in this repo (default is `master`). PR jobs never run today — only GitGuardian fires. One-line fix; **queued.**

3. **`HERM_COMPLIANCE.md` `/api/integration` wording is stale.** The doc still classifies it as "stateless calculator" — but the controller has always persisted to DB, and PR #31 made the route tenant-scoped + JWT-required. Doc should be updated to match reality (move `/api/integration` from the Public bucket to the Authenticated bucket).

4. **Migration-first vs `db:push`.** CI runs `npm run db:push` against the throwaway test DB. `PRODUCTION_READINESS.md` already lists the migrate-deploy switch as deferred — leave it deferred unless prioritised.

5. **Pre-existing lint warnings (120, 0 errors).** Mostly `consistent-type-imports` and `no-non-null-assertion`. Should be cleared in a focused style PR.

6. **`procurement.v2.audit.test.ts` cwd footgun.** Reported as failing when running `npx vitest` from the repo root (wrong cwd / config resolution). Passes cleanly under `npm run test:server` / `npm run verify`. Document in RUNBOOK.

## Recommended next session scope (proposal)

1. Update this doc to mark items #1 (cross-tenant) and #2 (Stripe webhook) closed — **this commit.**
2. CI workflow `branches: [main, develop]` → `master` fix — separate small PR.
3. `/api/sector/analytics` tier gating + pricing-copy alignment — separate PR (was explicitly off-limits without confirmation; now confirmed).

After those, the remaining deferred items (#3 doc text, #4 migration discipline, #5 lint warnings, #6 cwd footgun) are all low-urgency and can be batched later.
