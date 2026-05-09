# Phase 14 — overnight queue

**Status:** queue + paste-ready overnight prompt. Captured 2026-05-08
after PR #101 merged the demo-impact bundle (14.2 + 14.4 + 14.7 +
14.9 + 14.10) onto master `133fb16`. The seven items below are the
remaining UAT sub-phases the May 2026 review identified, sequenced
for an overnight Claude run that drives each item through push,
CI, the reviewer-bot fix-up loop, and (where green + Freddie has
auto-merge configured) merge using the GitHub MCP tools the
existing PRs have been using.

> **Auto-merge override.** CLAUDE.md's default "Final merge is
> always left to Freddie" rule is **explicitly suspended for this
> overnight session** at Freddie's request (PR #102 thread,
> "Automerge ok"). If a PR has GitHub auto-merge enabled at the
> repo level and every required check is green + every reviewer-
> bot thread is closed, the overnight session may merge it. The
> default rule still applies to all other Claude sessions.

The paste-ready overnight prompt is at the bottom of this file.

## Working state at time of writing

- `master` HEAD: `133fb16 feat(uat): Phase 14 demo-impact bundle (#101)`.
- CI required checks (exact names): `lint`, `typecheck`, `test`,
  `build`, `Validate Prisma schema`. Plus advisory: `GitGuardian
  Security Checks`, `Vercel Preview Comments`, the Vercel preview
  build, `Cursor Bugbot`, `Vercel Agent Review`.
- `npm run verify` = `lint && typecheck && test:ci && build` — must
  pass locally before every push.
- All PRs go via the GitHub MCP server (`mcp__github__create_pull_request`
  etc.), repository `RJK134/herm-platform`, base `master`. Every PR
  opens as **draft** so reviewer bots can do their pass before
  ready-for-review.
- Three reviewer bots have been observed actively commenting on
  every PR: GitHub Copilot, Cursor Bugbot, Vercel Vade. The
  overnight session must address each comment (fix or reply with
  rationale) before marking ready-for-review.
- Branch naming follows `claude/p<phase>-<n>-<topic>` (CLAUDE.md):
  the seven items below all carry a `claude/p14-…` prefix.

## Queue + ordering rationale

Order optimised for: (i) bank a small win first to validate the
loop, (ii) do the schema-touching items before the UI-touching
items so a migration drift doesn't block other work, (iii) keep
the largest items last so they can be partial-shipped if context
runs out.

| Order | Item | Rough effort | Why this slot |
|---|---|---|---|
| 1 | **14.7b** — relocate FHE scoring + mapping data to `prisma/seeds/` | 30–60 min | Smallest. Validates the PR loop end-to-end before any heavy work. Unblocks the FHE scores + framework-mappings which 14.7 still has wrapped in defensive try/catch. |
| 2 | **14.2b** — `regulationVersion` column on `GeneratedDocument` + PPN snippets | 1–2 hrs | Migration first while no one else is touching the schema. Closes Phase 14.2's deferred line item. |
| 3 | **14.9b** — CoI UI form + scoring gate | 2–3 hrs | Backend already in master; UI-only delta. Closes Phase 14.9's deferred line item. |
| 4 | **14.3** — PDF export pilot (Business Case only) | 3–4 hrs | Adds puppeteer/pdfkit + render endpoint. UI-only-ish; doesn't touch schema. Procurement officers explicitly want board-pack export. |
| 5 | **14.5** — WCAG 2.2 AA accessibility pass | 4–6 hrs | Likely splits into 14.5a (focus rings + ARIA) and 14.5b (chart summaries + keyboard nav). Item-level fail-safe: ship 14.5a alone if 14.5b looks like it will overrun. |
| 6 | **14.6** — i18n FR/DE | 3–5 hrs | Mechanically large but low-risk. Externalise strings + add `fr-FR` / `de-DE` resources + CI key-coverage check. |
| 7 | **14.8** — Enterprise RBAC role taxonomy | 4–6 hrs | Largest. Schema migration + middleware + admin UI. Intentionally last so it can stay partial if the overnight runs out. |

Total: 18–28 hrs. Realistic for an 8-hour overnight: 3–4 items.
The overnight prompt below explicitly tells the session to ship
what it can and stop cleanly when budget exhausts.

## Per-item playbook

### 14.7b — relocate FHE scoring + mapping data

**Branch:** `claude/p14-7b-relocate-fhe-data`

**Files to change:**
- New: `prisma/seeds/fhe-scoring-rules-data.ts` (copy of
  `server/src/data/fhe-scoring-rules.ts`)
- New: `prisma/seeds/fhe-manual-scores-data.ts` (copy of
  `server/src/data/fhe-manual-scores.ts`)
- New: `prisma/seeds/herm-to-fhe-mapping-data.ts` (copy of
  `server/src/data/herm-to-fhe-mapping.ts`)
- Modify: `prisma/seeds/fhe-scores.ts` to import from siblings
- Modify: `prisma/seeds/framework-mappings.ts` ditto
- Modify: `prisma/seed.ts` — drop the defensive try/catch around
  `seedFheScores` + `seedFrameworkMappings` (mirror 14.7 pattern)

**Acceptance:** `npm run verify` clean; on a fresh seed run, FHE
scores + cross-framework mappings populate without warnings.

### 14.2b — `regulationVersion` column + PPN snippets

**Branch:** `claude/p14-2b-regulation-version`

**Schema delta (Prisma):**
```
model GeneratedDocument {
  ...existing fields...
  regulationVersion String?  // e.g. "PA2023" / "PCR2015". Null = pre-Phase-14.2 row.
}
```

**Hand-crafted migration:** `prisma/migrations/<ts>_add_regulation_version/`
(mirror the CoI migration pattern from PR #101).

**Files to change:**
- `prisma/schema.prisma` (one nullable field)
- `prisma/migrations/<ts>_add_regulation_version/migration.sql`
- `server/src/api/documents/documents.service.ts` —
  `regulationVersion: 'PA2023'` stamped on every newly-generated
  document. Plus PPN 03/24 (cyber) + PPN 09/14 (modern slavery)
  snippets in the RFP/ITT template (look for the
  "Technical Requirements" section, append a "PPN compliance" subsection).
- `client/src/pages/DocumentGenerator.tsx` — surface the regulation
  version on each document card (e.g. "Generated under PA 2023").

**Acceptance:** new docs carry `regulationVersion = 'PA2023'`;
historical rows stay null and render as "(legacy)" in the UI.

### 14.9b — CoI UI form + scoring gate

**Branch:** `claude/p14-9b-coi-ui-gate`

**Files to change:**
- `client/src/pages/TeamWorkspaces.tsx` — add a "Conflict of
  Interest" tab (or section in an existing tab). On mount, GET
  `/api/evaluations/:id/coi/me`. If null, show a textarea form +
  "Submit declaration" button (POST `/api/evaluations/:id/coi`).
  If not null, show declaration text + signed-at + a "Revise"
  button.
- Score-submission gate: in the existing `submitDomainScores`
  flow, refuse to render the scoring form (or grey-out with a
  banner) until the user has a CoI declaration on the project.
- `client/src/lib/api.ts` — add `getMyCoi` / `submitCoi` wrappers
  alongside the existing evaluations API.

**Acceptance:** new evaluator on the seeded `demo-evaluation-001`
sees the CoI form first; submitting unblocks scoring; revising
re-prompts via signedAt comparison if needed (out of scope for
14.9b — just allow re-submit).

### 14.3 — PDF export pilot (Business Case)

**Branch:** `claude/p14-3-pdf-export-business-case`

**Vercel-compatibility note:** `puppeteer` ships a Chromium binary
~150 MB, busts Vercel's 50 MB function bundle limit. Use
`@sparticuz/chromium` + `puppeteer-core` (the standard pattern for
PDF generation on Vercel functions), OR `pdfkit` (no headless
Chrome, programmatic layout — simpler bundle but less HTML-fidelity).
Default to **`pdfkit`** for the pilot — Business Case is
structured Markdown; pdfkit can render it without HTML round-trip.
Re-evaluate for the RFP/ITT PDF in a follow-up if richer layout
is needed.

**Files to change:**
- New: `server/src/services/pdf/render-business-case.ts` — takes
  the existing `DocumentSection[]` shape and emits a Buffer.
- New endpoint: `GET /api/export/document/:id.pdf` — fetches the
  GeneratedDocument, calls render, sends with
  `Content-Type: application/pdf` + `Content-Disposition: attachment`.
- `server/package.json` — add `pdfkit` to dependencies.
- `client/src/pages/DocumentGenerator.tsx` — "Download PDF" button
  on each generated document card.

**Acceptance:** `curl /api/export/document/<id>.pdf` returns a
valid PDF for any Business Case document.

### 14.5 — WCAG 2.2 AA accessibility pass

**Branch:** `claude/p14-5-wcag-aa-pass`

**Splits into 14.5a (mechanical) + 14.5b (semantic-content) — the
overnight session can ship 14.5a alone if 14.5b looks like it
will overrun the budget.**

**14.5a — mechanical:**
- `tailwind.config.js` — add explicit `focus-visible` ring
  utilities; ensure base `:focus-visible` outline isn't `outline-0`.
- Audit every `<button>` / `<a>` / `<input>` for visible focus state.
- Heatmap: add patterns / numeric labels alongside R/A/G colour
  encoding so colour isn't the sole signal.
- ARIA roles: `role="img"` + `aria-label` on every chart wrapper.

**14.5b — semantic content:**
- Screen-reader summary text under each chart (e.g.
  "Bar chart: SITS:Vision scores 78% on Learning & Teaching, …").
- Keyboard navigation on basket cards: arrow keys to move
  selection, Enter to open detail.

**Acceptance:** `axe-core --tags wcag2a,wcag2aa` clean against the
top-five routes (`/`, `/heatmap`, `/system`, `/capability`, `/basket`).
Document-the-tool selection is in scope; running a full audit
report is out of scope.

### 14.6 — i18n FR/DE

**Branch:** `claude/p14-6-i18n-fr-de`

**Files to change:**
- New: `client/src/locales/fr-FR/*.json` (one resource per top-level
  page area — `common`, `procurement`, `evaluation`, `tco`, `docs`).
- New: `client/src/locales/de-DE/*.json` (same shape).
- Externalise inline strings to `t('key.path', 'fallback')` calls
  across `client/src/pages/`. Don't aim for 100% — start with the
  ten highest-traffic pages (Leaderboard, Heatmap, System Detail,
  Capability View, Vendor Showcase, Procurement Projects, Procurement
  Guide, Capability Basket, Documents, TCO Calculator).
- `client/src/i18n/config.ts` — add `fr-FR` + `de-DE` to the
  resources map and add to the language switcher.
- New CI check (advisory): `client/scripts/i18n-coverage.mjs` walks
  every locale's resource files, asserts every key in `en-GB` has
  a counterpart in `fr-FR` + `de-DE`. Fails CI on missing keys.

**Acceptance:** language switcher offers FR / DE; a non-trivial
sample of strings on the ten pages above renders translated.

### 14.8 — Enterprise RBAC role taxonomy

**Branch:** `claude/p14-8-rbac-roles`

**Schema delta:** new `Role` enum on `User` (or — cleaner — a
separate `UserRole` join table for multi-role users). UAT report
4.1 calls out six roles: Procurement Lead, Evaluator, Stakeholder,
Auditor, Vendor (read-only), Finance (TCO only).

**Files to change:**
- `prisma/schema.prisma` — `Role` enum or `UserRole` table.
- Hand-crafted migration.
- `server/src/middleware/role-guard.ts` (new) — `requireRole(...roles)`
  factory that checks `req.user.roles` (or `req.user.role`).
- Apply to existing routes: TCO endpoints behind `Finance` OR
  `Procurement Lead`; vendor portal stays as-is (separate auth).
  Audit log endpoints behind `Auditor` OR `Procurement Lead`.
- `client/src/pages/admin/RoleAssignment.tsx` (new) — admin-only UI
  to assign roles to users in the institution. Mounted at
  `/admin/roles`.

**Acceptance:** non-Procurement-Lead users see a 403 on routes
restricted to that role; admin UI lets you grant/revoke without
DB access.

## Safety rails

The overnight session must respect every CLAUDE.md guardrail.
Specifically:

1. **`npm run verify` clean before every push** — non-negotiable.
   If verify fails, debug locally; do not push a red branch.
2. **One PR per item** — per CLAUDE.md "PR batching rule",
   incremental fix-up commits go on the SAME branch as the PR;
   only a genuinely-distinct sub-phase opens a new PR.
3. **Conventional Commits** with the session URL trailer
   `https://claude.ai/code/session_<id>` on every commit. Match
   the style of recent merged commits (look at PR #99/100/101
   commit messages for examples).
4. **Draft PRs only** — open ready-for-review only after every
   reviewer bot comment is addressed (or replied to with rationale).
   `mcp__github__create_pull_request` with `draft: true` (boolean,
   not string).
5. **Never force-push** master. Never bypass hooks (`--no-verify`)
   and never disable commit signing (`--no-gpg-sign` /
   `-c commit.gpgsign=false`).
6. **Never branch off another open PR's branch** unless the work
   is genuinely a follow-up to an unmerged commit (rare). Each
   queue item branches off `master`.
7. **Reviewer-bot comments are addressed in fix-up commits on the
   same branch** — push, the bot re-reviews, iterate. Don't open
   a new PR for review fix-ups.
8. **HERM compliance + SSO architecture invariants** must not
   regress. Read `HERM_COMPLIANCE.md` + `docs/adr/0001-sso-architecture.md`
   before touching capability data routing or SSO surfaces.
9. **Stop cleanly at context budget** — if context window is
   running low, finish the current item's PR (push + draft PR
   open + replies to bot comments) but DON'T start the next item.
   The transcript log records what's done and what's queued.

## Failure handling

If an item is genuinely blocked (external API down, an irreducible
test failure that points at a deeper architecture decision),
**don't hang**. Skip the item, write a clear note in the
transcript ("**14.X SKIPPED:** <one paragraph explaining why and
what would unblock**>"), and move to the next.

Items most likely to be skipped:
- **14.3 PDF export** if the Vercel function bundle limit blocks
  pdfkit (fall back to puppeteer-core + sparticuz chromium AND
  acknowledge bundle size in the PR).
- **14.6 i18n** if translation strings would need professional
  translation rather than my best-effort French/German (skip the
  externalisation work and just stub `fr-FR.json` / `de-DE.json`
  with English fallbacks + a TODO note).
- **14.8 RBAC** if role-assignment touches the existing
  authentication chokepoint in ways that would clash with the
  Phase 11 SSO work — better to skip than to introduce a regression.

## Logging

The overnight session writes a transcript to
`progress/phase-14-overnight-transcript-<YYYY-MM-DD>.md` as it
goes. Each item gets a section: branch name, PR number, commit
SHAs, reviewer-bot summary, status (merged / draft / skipped).
A morning review is "read one markdown file, see what landed".

## Paste-ready overnight prompt

Copy everything between the `BEGIN` / `END` markers below into a
fresh Claude Code session. The session will work the queue from
top to bottom, opening one PR per item, addressing reviewer-bot
comments, and merging green PRs.

```
========================== BEGIN OVERNIGHT PROMPT ==========================

You are running an overnight session on the herm-platform repo at
/home/user/herm-platform. master HEAD is 133fb16 (Phase 14 demo-impact
bundle merged via PR #101). The queue and per-item briefs live in
progress/phase-14-overnight-queue.md — read that file in full before
starting.

Mission: ship as many of the seven sub-phases (14.7b, 14.2b, 14.9b,
14.3, 14.5, 14.6, 14.8) as fits in the available context budget,
strictly in queue order. Each item is its own branch + draft PR;
draft is flipped to ready-for-review once every reviewer-bot
comment is addressed. Auto-merge is authorised for this session
only (Freddie's explicit override on PR #102) — if the PR has
auto-merge enabled at the repo level AND every required check is
green AND every reviewer-bot thread is closed, you may merge it.
Otherwise leave it ready-for-review for Freddie's manual merge.

Per-item loop:

1. git checkout master && git pull origin master --ff-only
2. git checkout -b claude/p14-<n>-<topic>  (per the per-item brief)
3. Implement the item per the brief in progress/phase-14-overnight-queue.md.
   Read the referenced files BEFORE editing them. Write tests
   alongside non-trivial logic. Check Phase 11/12/13 patterns
   (CLAUDE.md "Patterns established by recent work") before
   inventing new ones.
4. npm run verify — must be clean. If not, debug and fix; never
   push a red branch.
5. Commit with Conventional Commits + session URL trailer
   https://claude.ai/code/session_01FnpkprRJgGzv59XxPSnhFc
6. git push -u origin <branch>
7. mcp__github__create_pull_request({owner: 'RJK134', repo:
   'herm-platform', base: 'master', head: '<branch>', title:
   '<conventional-commits prefix>(<scope>): <subject>' — pick the
   right prefix per the change (`feat(phase-14)` for new behaviour,
   `fix(phase-14)` for a bug fix, `refactor(phase-14)` for code-
   quality moves with no behaviour change, `docs(...)` if the PR is
   docs-only), body: '<full PR description with Summary / What
   changed / Test plan / Out of scope sections>', draft:
   true}). Note the PR number.
8. Watch for reviewer-bot activity via mcp__github__pull_request_read
   ({method: 'get_review_comments', pullNumber: <n>}). Three bots
   you'll see: GitHub Copilot (reviews code style + correctness),
   Cursor Bugbot (reviews security + tenant scope), Vercel Vade
   (reviews security + multi-tenant). Each comment gets either:
   (a) a fix-up commit on the same branch, OR
   (b) a reply via mcp__github__add_reply_to_pull_request_comment
       explaining why the comment doesn't apply.
   Iterate until every thread is closed.
9. Once green AND every bot thread closed, append a transcript
   entry to progress/phase-14-overnight-transcript-<today>.md and
   move to the next queue item.

Stop conditions:
- Queue exhausted (all seven items shipped) → write a final
  transcript entry summarising the run, end the session.
- Context budget low (you can sense your own state) → finish the
  CURRENT item cleanly (commit + push + draft PR open + every bot
  comment replied to or fixed), write a transcript entry, then
  end. Don't start a new item if you're not confident you can
  finish it.
- An item is genuinely stuck → write "14.X SKIPPED: <reason +
  what would unblock>" in the transcript and move on. Don't hang.

Safety rails (every one is non-negotiable):
- npm run verify before every push
- One PR per item (CLAUDE.md PR batching rule)
- Conventional Commits + session URL trailer
- Draft PRs only (draft: true on create_pull_request)
- Never force-push master; never bypass hooks
- Never branch off an open PR's branch
- Read HERM_COMPLIANCE.md + docs/adr/0001-sso-architecture.md
  before touching capability routing or SSO surfaces
- Use the GitHub MCP tools (mcp__github__*) for ALL GitHub
  interactions — there is no `gh` CLI access

Reference docs (read once at the top of the session, refer back
during item work):
- progress/phase-14-overnight-queue.md — the queue + per-item briefs
- progress/phase-13-vercel-serverless-evaluation.md — runtime
  posture + which routes are serverless-safe
- CLAUDE.md — repo conventions, especially "Patterns established
  by recent work" and "Test patterns"
- docs/adr/0001-sso-architecture.md — SSO invariants
- HERM_COMPLIANCE.md — capability data licence invariants

Begin with item 1 (14.7b). Work down the queue. Log everything
in the transcript. Stop cleanly.

=========================== END OVERNIGHT PROMPT ===========================
```

## Item-1 sanity check (run this before kicking off the overnight)

Quick "is everything healthy" sweep. The overnight session should
fail fast if any of these are red:

1. `git status` clean on master.
2. `git log --oneline -1` shows `133fb16`.
3. `npm run verify` clean.
4. `mcp__github__list_pull_requests({state: 'open'})` shows 0 open
   PRs (so the overnight doesn't trip over my own un-merged work).
5. The Vercel preview build on the latest master deploy is green
   — if it's red, we have a regression that should be triaged
   first, not papered over by piling more PRs on top.
