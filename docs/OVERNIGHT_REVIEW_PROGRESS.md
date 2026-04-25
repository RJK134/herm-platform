# Overnight stabilisation pass — progress report

**Branch:** `claude/stability-improvements-bj0tB`
**Date:** 2026-04-25
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
the canonical matrix. Compliant prefixes (no fix tonight):

`/api/health`, `/api/ready`, `/api/auth/*`, `/api/institutions/*`,
`/api/systems`, `/api/capabilities`, `/api/scores`, `/api/export`,
`/api/vendors`, `/api/research`, `/api/scoring`, `/api/chat`,
`/api/baskets`, `/api/tco`, `/api/procurement`, `/api/integration`,
`/api/vendor-portal`, `/api/evaluations`, `/api/admin`,
`/api/sector/analytics` (tier-gating explicitly deferred per
`HERM_COMPLIANCE.md` "What's deferred"), `/api/keys`, `/api/frameworks`,
`/api/framework-mappings`.

## Discrepancies found and disposition

| # | Severity | Prefix | Disposition |
|---|---|---|---|
| 1 | 🔴 HIGH | `/api/subscriptions/{checkout,status,cancel,invoices}` — `optionalJWT` allowed anonymous callers; `createCheckout` would create orphan Stripe sessions with `institutionId=undefined`. | **Fixed** — router-level `authenticateJWT` after the webhook; controllers now read `req.user.institutionId` directly. |
| 2 | 🟠 MED | `/api/architecture/*`, `/api/value/*`, `/api/documents/*` mutations — `optionalJWT` only; controllers silently accepted writes with no `institutionId`. | **Fixed** — stateless previews (`/analyse`, `/calculate`, `/generate`) keep `optionalJWT` and stay public; persisted POST/GET/PATCH/DELETE require JWT. |
| 3 | 🟡 LOW-MED | `/api/notifications` — anonymous PATCH `/:id/read` could flip another user's notification (where-clause did not scope by `userId`). | **Fixed** — router now requires `authenticateJWT`; PATCH switched to `updateMany` scoped by `{ id, userId }` with a 404 envelope on count=0. |
| 4 | 🟢 INFO | `/api/sector/analytics/*` `optionalJWT` only. | **No change** — explicitly deferred in `HERM_COMPLIANCE.md` "What's deferred". Recorded as follow-up below. |
| 5 | 🟢 INFO | `/api/integration/*` no auth. | **No change** — matches "stateless calculator" intent in the matrix. |
| - | (release-discipline) | `documents.service.ts`, `server/src/index.ts`, `client/src/pages/DocumentGenerator.tsx` — duplicate `import { PRODUCT } from '.../branding'` from commit `b93f3c9`. | **Fixed** — single-line dedupes; was blocking `npm run typecheck` and breaking 15 vitest test-file transforms. |

## Code changes

| File | Change |
|---|---|
| `server/src/api/subscriptions/subscriptions.router.ts` | Replace `optionalJWT` with `authenticateJWT` (after webhook). |
| `server/src/api/subscriptions/subscriptions.controller.ts` | Drop now-unreachable anonymous-fallback branches; use `req.user!` directly. |
| `server/src/api/architecture/architecture.router.ts` | Stateless `/analyse` keeps `optionalJWT`; persisted ops gated by `authenticateJWT`. |
| `server/src/api/value/value.router.ts` | Same pattern as architecture; `/benchmarks` and `/calculate` stay public. |
| `server/src/api/documents/documents.router.ts` | Same pattern; `/generate` stays public. |
| `server/src/api/notifications/notifications.router.ts` | Router-level `authenticateJWT`; PATCH `/:id/read` scoped to `req.user.userId` via `updateMany` + 404 on count=0. |
| `server/src/api/documents/documents.service.ts` | Removed duplicate `PRODUCT` import. |
| `server/src/index.ts` | Removed duplicate `PRODUCT` import. |
| `client/src/pages/DocumentGenerator.tsx` | Removed duplicate `PRODUCT` import. |

## Tests added

**`server/src/api/subscriptions/subscriptions.router.test.ts`** (new, 7 tests)
- anonymous /checkout, /status, /cancel, /invoices → 401, no Stripe / Prisma side-effects
- authenticated FREE-tier /status → 200 with FREE envelope
- /checkout passes `institutionId` from JWT, never the body (spoofed body is ignored)
- /webhook stays public (signature is the auth, not JWT)

**`server/src/__tests__/tierControl.test.ts`** (new, 14 tests)
Pins HERM_COMPLIANCE.md invariants end-to-end through real routers + middleware:
- FREE + anonymous can list `/api/capabilities` against the public HERM framework
- FREE blocked from non-public framework (FHE) at `tierGate`
- PROFESSIONAL can read FHE
- FREE and PROFESSIONAL blocked from `/api/framework-mappings` and `/api/keys`
- ENTERPRISE passes both
- Anonymous on `/api/keys` → 401 (auth before tier)
- HERM attribution: `meta.provenance.framework.publisher = "CAUDIT"` and
  `licence.type = "CC-BY-NC-SA-4.0"` on `/api/capabilities` responses
- Notifications PATCH `/:id/read` is anonymous-blocked, scopes by `userId`,
  and returns 404 on a wrong-owner id

**`server/src/__tests__/persistedArtefactsAuth.test.ts`** (new, 12 tests)
Pins the architecture / value / documents stateless-vs-persisted boundary:
- `/analyse`, `/calculate`, `/generate`, `/benchmarks` stay public
- All persisted POST/GET/PATCH/DELETE return 401 to anonymous

**Total new tests:** 33. **Server suite:** 304 / 304 passing (was 271 / 271
once the duplicate-`PRODUCT` parse error was unblocked). **Client suite:**
64 / 64 passing.

## Verify state

```
npm run verify                    → PASS (lint 0 errors / 120 pre-existing warnings, typecheck clean, 368 tests, build OK)
```

## Unresolved items / follow-ups

Recorded — **not** done tonight, deliberately scoped out:

1. **`/api/sector/analytics/*` tier gating.** Currently `optionalJWT` + k-anon
   only. `HERM_COMPLIANCE.md` "What's deferred" calls this out; copy on the
   Subscriptions page does not yet list it as a paid feature. Align gate +
   pricing copy in a dedicated PR.

2. **Documents / architecture / value cross-tenant reads.** The route-level
   auth is now correct, but the controllers' `listDocuments`,
   `getDocument`, `getAssessment`, `listAssessments`, `listAnalyses`,
   `getAnalysis` etc. still don't filter by `institutionId`. An authenticated
   tenant A can read tenant B's persisted artefacts by id-guessing. Fix in
   the relevant services / controllers as a follow-up — bigger than tonight's
   scope and orthogonal to the auth matrix.

3. **Stripe webhook raw-body parsing.** App-level `express.json()` runs at
   `app.ts:50`, which means by the time the request reaches the router-level
   `express.raw()` on `/api/subscriptions/webhook`, the body stream has
   already been consumed. The webhook handler then calls
   `stripeService.handleWebhook(req.body as Buffer, sig)` with a parsed
   object cast to Buffer. Stripe signature verification will reject this in
   production. Fix by moving the webhook route registration to `app.ts`
   *before* `express.json()`, or by skipping JSON parsing for that path.
   (Touched the auth shape only tonight per the brief: "Keep webhook raw-body
   handling intact for Stripe.")

4. **Migration-first vs `db:push`.** CI runs `npm run db:push` against the
   throwaway test DB. `PRODUCTION_READINESS.md` already lists the
   migrate-deploy switch as deferred — leave it deferred.

5. **Pre-existing lint warnings (120, 0 errors).** Mostly
   `consistent-type-imports` and `no-non-null-assertion`. Unchanged tonight;
   they should be cleared in a focused style PR.

6. **`procurement.v2.audit.test.ts > returns 404 for a missing evaluation`**
   was reported as failing when running `npx vitest` directly from the repo
   root (wrong cwd / config resolution). It passes cleanly under
   `npm run test:server` and `npm run verify`. Not actionable; just a footgun
   for local dev. Document in RUNBOOK if it bites again.

## Recommended next step (tomorrow)

**Tackle the cross-tenant read leak in the persisted-artefact controllers
(follow-up #2)** — this is the highest-value remaining risk on the same
surface I touched tonight. The fix is pure controller/service work
(filter `where: { institutionId: req.user.institutionId }` on each
list/get) plus a Supertest-level "tenant A cannot read tenant B's row"
test per surface. No router or middleware changes needed.

Second-most-valuable: **Stripe webhook raw-body fix (follow-up #3)** —
needs a 5-line surgery in `app.ts` (move webhook registration ahead of
`express.json()`) plus an end-to-end test against the Stripe CLI.
