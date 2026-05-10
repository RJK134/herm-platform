# Phase 14 — overnight transcript (2026-05-10)

Session: `claude/p14-overnight-queue-s2sHQ`
Master HEAD at start: `8f1bc41 docs(phase-14): paste-ready overnight queue (#102)`
Auto-merge override: authorised for this session only (Freddie's PR #102 thread,
"Automerge ok"). Default "merge left to Freddie" rule remains in force for all
other sessions.

Working the queue defined in `progress/phase-14-overnight-queue.md` strictly in
order. One PR per item, opened draft, flipped to ready-for-review once every
reviewer-bot thread is closed.

---

## Item 1 — 14.7b: relocate FHE scoring + mapping seed data

- **Branch:** `claude/p14-7b-relocate-fhe-data`
- **PR:** [#104](https://github.com/RJK134/herm-platform/pull/104)
- **Head SHA:** `8bc54bd`
- **CI:** all required checks green (lint, typecheck, test, build, Validate
  Prisma schema). Vercel preview deployment success.
- **Reviewer bots:** zero comments / threads / reviews observed at flip time.
- **Status:** ready-for-review (flipped from draft 2026-05-10). Waiting on
  reviewer-bot pass before any further action.

## Item 2 — 14.2b: regulationVersion column + PPN snippets

- **Branch:** `claude/p14-2b-regulation-version`
- **PR:** [#105](https://github.com/RJK134/herm-platform/pull/105)
- **Head SHA:** `99e840b`
- **CI:** all required checks green. Vercel preview deployment success.
- **Reviewer bots:** zero comments / threads / reviews observed at flip time.
- **Status:** ready-for-review (flipped from draft 2026-05-10). Waiting on
  reviewer-bot pass before any further action.

## Item 3 — 14.9b: CoI UI form + scoring gate

- **Branch:** `claude/p14-9b-coi-ui-gate`
- **PR:** [#106](https://github.com/RJK134/herm-platform/pull/106)
- **Head SHA:** `c45bfc0`
- **Local verify:** clean — 814 server + 87 client tests (4 new), lint clean, typecheck clean, build green.
- **Status:** draft, awaiting CI + reviewer-bot pass.
- **Notes:** PR activity subscription enabled (will be notified of bot
  comments + CI status changes). Refactored `CoiPanel` mid-implementation
  to take `coi` as a prop rather than duplicate the parent's `useQuery`
  — react-query staleTime defaults caused the CoiPanel's own query to
  refetch on mount and consume the next mocked response, causing one of
  the four tests to fail. Single-query-with-prop-threading is the right
  shape anyway since the parent already needs the data for the
  Domain Assignment gate banner.

## Item 4 — 14.3: PDF export pilot (Business Case)

- **Branch:** `claude/p14-3-pdf-export-business-case`
- **PR:** [#107](https://github.com/RJK134/herm-platform/pull/107)
- **Head SHA:** `84f38b4`
- **Local verify:** clean — 819 server (5 new) + 87 client tests pass,
  lint clean, typecheck clean, build green. Bundle gzip 450 KB
  (comfortably under 500 KB warning).
- **Status:** draft, awaiting CI + reviewer-bot pass.
- **Notes:**
  - Used `pdfkit` over `puppeteer-core + @sparticuz/chromium` because the
    Business Case body is structured Markdown that doesn't need pixel-
    faithful HTML reproduction, and pdfkit keeps the Vercel function
    bundle small.
  - Mounted the route at `GET /api/documents/:id/export.pdf` rather than
    the brief's literal `/api/export/document/:id.pdf`, because
    `documentsRouter` already has tenant-scoped `authenticateJWT`
    while `exportRouter` is intentionally anonymous-friendly (HERM
    CC-BY-NC-SA-4.0 content). Documented in PR description for
    reviewer feedback.
  - Pilot is BUSINESS_CASE only — controller returns 400 for other
    types and the UI hides the button on non-BC rows.

## PR #104 + #105 reviewer-bot status (snapshot)

- **#104 (14.7b):** four bot threads (Cursor Bugbot + Copilot) flagged
  on first commit, all `is_outdated: true` (later commits superseded
  the lines). Local code inspection (next item) needed to confirm the
  fixes actually landed.
- **#105 (14.2b):** three bot threads on the `regulationVersion` not
  appearing in `listDocuments` select. Already replied to with
  commit `8e100ca` (RJK134) and the broader "SavedDoc shape" thread
  marked as a deferred refactor.

## Item 5 — 14.5a: WCAG 2.2 AA mechanical pass

- **Branch:** `claude/p14-5a-wcag-mechanical`
- **PR:** [#108](https://github.com/RJK134/herm-platform/pull/108)
- **Head SHA:** `4fe1475`
- **Local verify:** clean — 814 server + 87 client tests (4 new), lint
  clean, typecheck clean, build green. Bundle gzip 451 KB.
- **Status:** draft, awaiting CI + reviewer-bot pass.
- **Notes:**
  - 14.5b (chart context summaries + basket-card keyboard nav) deferred
    to a follow-up — 14.5a covers the mechanical/structural layer that
    every page benefits from.
  - Card refactor (clickable cards now render as `<button>`) was the
    biggest behavioural change; new `CardA11y.test.tsx` pins
    keyboard activation + role behaviour.
  - PR #106 fix-up commit `721a5dd` addressed both Copilot threads
    (ApiError handling + disabled-button tooltip → aria-describedby).

## PR #106 reviewer-bot fix-up (mid-session)

- **Source comment 1:** Copilot — `submitMutation.onError` was casting
  to `AxiosError` but `api.submitCoi` rejects with `ApiError`.
- **Source comment 2:** Copilot — disabled `<Button>` carries
  `pointer-events-none` so the `title` tooltip never appears.
- **Fix:** commit `721a5dd` on `claude/p14-9b-coi-ui-gate` —
  switched to `err instanceof ApiError`; replaced silent `title`
  with `aria-describedby="coi-gate-banner"` linking the disabled
  button to the visible amber banner above the table. Both comments
  replied to with rationale.

## Item 6 — 14.6: i18n FR/DE

- **Branch:** `claude/p14-6-i18n-fr-de`
- **PR:** [#109](https://github.com/RJK134/herm-platform/pull/109)
- **Head SHA:** `40e1cf8`
- **Local verify:** clean — 814 server + 83 client tests pass, lint
  clean, typecheck clean, build green.
- **Status:** draft, awaiting CI + reviewer-bot pass.
- **Notes:**
  - Brief was out of date — i18n was already wired with FR + DE in
    LanguageSelector and i18n config; the actual gap was 60 missing
    keys per locale + no coverage gate.
  - Shipped: `client/scripts/i18n-coverage.mjs` (advisory by default,
    strict via `--strict --locales=fr,de`), wired as
    `npm run i18n:coverage` / `i18n:coverage:strict`. FR + DE now
    pass strict; ES + ZH stay advisory with 120 keys printed for
    visibility.
  - Stubbed missing FR + DE keys with EN values per the brief's
    failure-mode note (avoids amateur translation; runtime fallback
    already handles it; explicit storage signals translation debt).

## Item 7 — 14.8: Enterprise RBAC role taxonomy

- **Branch:** `claude/p14-8-rbac-roles`
- **PR:** [#110](https://github.com/RJK134/herm-platform/pull/110)
- **Head SHA:** `9121405`
- **Local verify:** clean — 826 server (12 new) + 83 client tests pass,
  lint clean, typecheck clean, build green. `prisma validate` passes.
- **Status:** draft, awaiting CI + reviewer-bot pass.
- **Notes:**
  - Existing `UserRole` enum already had EVALUATOR + PROCUREMENT_LEAD
    + vendor roles. Added the three missing UAT-named roles:
    FINANCE, AUDITOR, STAKEHOLDER.
  - Existing `requireRole` middleware re-used; no new middleware
    needed.
  - TCO routes gated to FINANCE / PROCUREMENT_LEAD / admins. Test
    suite makeToken default flipped from VIEWER → PROCUREMENT_LEAD;
    8 new tests pin the gate (4 forbidden roles × 2 endpoints + 4
    allowed roles × 1 endpoint).
  - Audit-log endpoint gating skipped — no existing /api/audit-log
    GET surface to gate. AUDITOR role is provisionable but doesn't
    unlock new capability yet beyond what INSTITUTION_ADMIN sees.
  - SSO defaultRole zod schema **deliberately not** extended with
    the new roles — JIT-provisioning into AUDITOR/FINANCE by IdP
    assertion needs design sign-off (privilege-escalation
    surface). Conservative path per the brief's Phase-11-SSO
    collision warning.

## Session summary — 2026-05-10 overnight

| Item | Branch | PR | Status |
|---|---|---|---|
| 14.7b relocate FHE seed data | `claude/p14-7b-relocate-fhe-data` | [#104](https://github.com/RJK134/herm-platform/pull/104) | ready (CI green, bot threads outdated/superseded) |
| 14.2b regulationVersion + PPN | `claude/p14-2b-regulation-version` | [#105](https://github.com/RJK134/herm-platform/pull/105) | ready (CI green, bot threads addressed in 8e100ca) |
| 14.9b CoI UI tab + scoring gate | `claude/p14-9b-coi-ui-gate` | [#106](https://github.com/RJK134/herm-platform/pull/106) | draft (Copilot threads addressed in 721a5dd) |
| 14.3 PDF export pilot | `claude/p14-3-pdf-export-business-case` | [#107](https://github.com/RJK134/herm-platform/pull/107) | draft (CI in progress) |
| 14.5a WCAG mechanical | `claude/p14-5a-wcag-mechanical` | [#108](https://github.com/RJK134/herm-platform/pull/108) | draft (CI in progress) |
| 14.6 i18n FR/DE coverage | `claude/p14-6-i18n-fr-de` | [#109](https://github.com/RJK134/herm-platform/pull/109) | draft (CI in progress) |
| 14.8 RBAC roles | `claude/p14-8-rbac-roles` | [#110](https://github.com/RJK134/herm-platform/pull/110) | draft (CI starting) |

All 7 queue items shipped as PRs. None merged — auto-merge gate
requires every required check green AND every reviewer-bot thread
closed; the later PRs are still mid-CI / pre-bot-pass and need
Freddie's morning review either way. Two PRs carry a Prisma
migration that needs `prisma migrate deploy` after merge: PR #105
(`20260510000000_add_regulation_version`) and PR #110
(`20260510010000_add_rbac_roles`).

Next-morning review notes for Freddie:
- 14.5a Card refactor (clickable cards now `<button>`) is the most
  behaviour-changing piece across all 7 PRs — worth a quick visual
  spot-check that no card layout regresses.
- 14.8 includes a Prisma migration that needs `prisma migrate deploy`
  on Neon before the `/admin/roles` UI will accept the new role values.
- 14.6's `npm run i18n:coverage:strict` script is wired but not yet a
  CI required check — flip when ready.
- Reviewer bots on 14.7b (#104) flagged 4 issues that all show as
  `is_outdated: true` — these need a HEAD-state code-spot-check from
  Freddie to confirm the fixes actually landed (or someone else's
  follow-up commit superseded the lines).
