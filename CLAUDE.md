# CLAUDE.md

Working notes for Claude Code sessions in this repo. Read this first.

# PR batching rule

Claude must not create tiny incremental pull requests.

Default behavior:
- One Claude build session = one branch = one pull request.
- Batch related fixes together.
- Do not create follow-up PRs for small fixes.
- Update the existing PR instead.
- Leave unrelated or risky work as deferred notes.
- Final merge is always left to Freddie.

---

## What this is

Future Horizons ASPT — a procurement and capability intelligence platform for
UK higher-ed customers, built around UCISA HERM v3.1 (165 capabilities, 21
systems, 5-language i18n) plus the proprietary FHE Capability Framework.

Surface includes: capability scoring, baskets, sector analytics, vendor
portal, multi-jurisdiction procurement, Stripe billing, AI assistant,
SAML + OIDC SSO with multi-IdP per tenant, SCIM 2.0 provisioning, soft-delete
cascade with retention scheduler, and a tiered tenancy model
(free / professional / enterprise).

The product is **feature-complete for v1** as of Phase 11. Phase 12 is the
operational-maturity phase (see `progress/phase-12-kickoff.md`).

## Repo layout

Monorepo via npm workspaces (Node 20 baseline, ESM-only):

| Workspace | Path | Stack |
|---|---|---|
| Server | `server/` | TypeScript + Express + Prisma + Postgres + Vitest. Optional Redis. |
| Client | `client/` | TypeScript + React 18 + Vite + React Router + Tailwind + Vitest. |
| Schema | `prisma/` | Single `schema.prisma` + numbered migrations under `prisma/migrations/`. |

## Tech stack quick reference

- **Auth:** JWT sessions (`jsonwebtoken`); per-tenant SAML via `@node-saml/node-saml`; per-tenant OIDC via `openid-client` v6 (ESM); API keys (`herm_pk_…` prefix); SCIM 2.0 with API-key + `admin:scim` permission.
- **Persistence:** Prisma 5.22 + Postgres 16. In-memory `Map` + Redis fallback for short-lived state (lockout counters, OIDC PKCE flow, SAML SLO replay, session JTI store).
- **Observability:** structured JSON logs with `req.id` correlation.
- **CI:** GitHub Actions — lint, typecheck, test (with Postgres + Redis service containers), build, prisma-validate.
- **Pre-existing review bots:** Cursor Bugbot + GitHub Copilot review every PR. Treat their findings as actionable; Bugbot is the higher-signal of the two for behaviour bugs.

## Working conventions

### Branches

Pattern: `claude/p<phase>-<n>-<topic>`. Examples:
- `claude/p11-pr5-softdelete-cache-audit` — Phase 11 audit follow-up #5
- `claude/p12-2-metrics-endpoint` — Phase 12 sub-phase 2
- `claude/add-claude-md` — single-purpose docs PR, no phase prefix needed

Always branch off `master`. Do not branch off another open PR's branch unless the work is genuinely a follow-up to an unmerged commit (rare).

### Commit messages

Conventional Commits (`feat`, `fix`, `chore`, `refactor`, `ci`, `docs`).
Always end with the Claude session URL trailer:

```
feat(observability): Prometheus /metrics endpoint + auth/SSO counters (Phase 12.2)

[multi-paragraph body explaining why]

https://claude.ai/code/session_<id>
```

Long bodies are encouraged for non-trivial changes — they become the diff
description on github.com and the source of truth for *why*. Match the style
of recent merged commits in `git log`.

### PR descriptions

Sections in this order: **Summary** → **What changed** (subsections per
file/concern) → **Test plan** (checkbox list, with checked items reflecting
local-`verify` proof) → **Out of scope / deferred**. Always link to relevant
ADRs / `RUNBOOK.md` sections for invariants the change interacts with.

Open PRs as **draft** when they need triage discussion; ready-for-review only
when the diff is final. The `mcp__github__create_pull_request` parameter is
`draft: true` (boolean — passing `"true"` as a string fails).

### Before pushing

```bash
npm run verify   # lint + typecheck + test:ci + build (~60s)
```

Must be green locally. Do not push if `verify` fails — CI will reject and you
burn one of the 5-PR-batch slots in the user's review queue.

### Per-PR scope ceiling (per the batching rule above)

- A "PR" is one logical change. Every commit on the branch should be in
  service of the PR's stated goal.
- Review-comment fix-ups go on the **same branch** as a follow-up commit, not
  a new PR. Push the commit, reply on the thread, let CI re-run.
- If you discover a separate bug while working on a PR, jot it in the PR's
  "Out of scope / deferred" section and surface it back to Freddie. Do not
  silently expand scope.

## Architecture invariants

Read these once per session before touching the relevant surface:

- **HERM compliance** (`HERM_COMPLIANCE.md`): HERM capability data is free at
  every tier including anonymous; provenance / attribution travels with the
  data; `tierGate` passes public frameworks through unconditionally.
  Performance work must not introduce a "fast path" that bypasses these.
- **SSO architecture** (`docs/adr/0001-sso-architecture.md`): opaque 404 (not
  403) on SSO tier-rejection; IdP owns SSO credential-failure lockout; MFA
  bypass on SSO is intentional (`mfaBypassed: true` audited).
  Observability must not leak the rejection reason via metric labels or
  trace tags. **Never label a metric or audit row with `institutionSlug`
  on the SSO surface.**
- **Production posture** (`PRODUCTION_READINESS.md` + `RUNBOOK.md`): proposed
  SLOs (99.5% availability, p95 < 500ms read / 1500ms AI chat); tracing /
  alerting destinations are open questions awaiting product-owner input.

## Patterns established by recent work

These patterns came out of merged PRs (#79–#88). Reuse them rather than
reinventing.

### In-memory caches: LRU + active eviction

Every process-local `Map`-based cache must have:
1. A bounded `MAX_CACHE_SIZE`.
2. Active eviction of expired entries on every miss-set (`pruneExpired(now)`),
   not just the lazy TTL check on `get`.
3. Either FIFO eviction (cheap, fine when "one entry per active user") or
   true LRU touch (delete + reinsert on hit) when the workload has hot keys.

Examples: `server/src/api/sso/oidc.ts` (LRU, OIDC config),
`server/src/api/scim/scim.router.ts` (FIFO, negative auth cache).

### Redis key namespaces

Redis key construction is not yet centralised in a single
`server/src/lib/redis-keys.ts` helper in this tree. When changing or adding
Redis namespaces, follow the existing local builder/constant pattern in the
relevant module and avoid introducing new scattered prefix string literals
across modules.

### Audit logs

Action namespace is `<surface>.<event>.<outcome?>`:
- `auth.login.success` / `auth.login.fail`
- `auth.sso.slo_success` / `auth.sso.slo_fail`
- `admin.sso.create` / `admin.sso.update` / `admin.sso.delete`
- `admin.sso.read_self` / `admin.sso.read_all` / `admin.sso.read_by_institution`
- `keys.create` / `keys.revoke`

`audit()` from `server/src/lib/audit.ts` is best-effort — it never throws;
losing an audit row is regrettable, losing the action because the audit
write failed would be worse. `await` it inline; do not fire-and-forget
unless the audit write is genuinely outside the request critical path.

### Metric label hygiene

`server/src/lib/metrics.ts` — every metric uses the `herm_` prefix. Labels
are tight, low-cardinality, and **never include user / institution / JWT
claim values**. Route labels collapse dynamic IDs via Express's matched
route pattern (`/api/users/:id`). Unmatched paths get the `__not_found`
sentinel.

### Test hooks

When a module holds module-level state (caches, registries, in-memory
stores), export a reset hook so tests can isolate. Naming convention:

- `__resetXForTests()` — for module-internal state with double-underscore
  to clearly mark "not for production code"
- `_resetXForTests()` — single-underscore variant (older code; either is
  fine for new modules)
- `__XSizeForTests()` — read-only inspection of internal state

## Test patterns

### Vitest setup

- Server: `server/vitest.config.ts` — `node` environment, `fileParallelism: false`.
- Client: `client/vitest.config.ts` — `jsdom` environment.
- Setup files: `server/src/test/setup.ts`, `client/src/__tests__/setup.ts`.

### `NODE_ENV=test` short-circuits

`isUserSoftDeleted` (in `server/src/middleware/auth.ts`) skips the DB lookup
in test mode by default to avoid consuming queued `prisma.user.findUnique`
mocks across the suite. Tests that specifically pin the revocation behaviour
must set `process.env.ENABLE_SOFT_DELETE_AUTH_CHECK = 'true'` in `beforeEach`
and clean up in `afterEach` (see `server/src/__tests__/softDeleteRevocation.test.ts`).

### `SSO_SECRET_KEY` for encrypt-path tests

`encryptSecret` in `server/src/lib/secret-cipher.ts` throws when
`SSO_SECRET_KEY` is unset and a non-empty plaintext arrives. Tests that
exercise SSO write paths with a `samlCert` or `oidcClientSecret` must
wrap in a try/finally that sets the env var and resets the cipher key
cache (see `server/src/api/admin/admin-sso.test.ts`'s "secret-only rotation"
test for the canonical pattern).

If a test only needs to verify control flow (not encryption), prefer to
omit secret material from the request body — most controllers preserve
existing values when fields are absent ("keep-or-replace" semantics).

### SCIM mocks

The prismaMock pattern in `server/src/__tests__/scimAuthHardening.test.ts`
is the reference. SCIM uses `apiKey.findUnique` with a nested
`institution: { select: { deletedAt: true } }` join — mock the whole shape
or auth fails opaquely.

## Known recurring issues

### `ssoDiscoveryRateLimit.test.ts` patch (until merged)

PR #81 merged with a typecheck error — `ssoDiscoveryRateLimit.test.ts:88`
destructures `{ ssoRouter }` from a default export, plus the path it asserts
is `/:slug/discover` instead of the actual `/:institutionSlug/discover`.
Every PR branched off master inherits this until one of #83/#84/#85/#86/#87/#88
merges. The two-line patch:

```ts
// line 88
const { default: ssoRouter } = await import('../api/sso/sso.router');
// line 102
expect(routeMiddlewareByPath.get('/:institutionSlug/discover')).toContain(discoveryRateLimiter);
```

Apply once near the start of each new PR if `npm run typecheck` flags it.

## Verification

Single command at the repo root:

```bash
npm run verify     # lint + typecheck + test:ci + build
```

Coverage of `verify`:
- ESLint: 0 errors required, 170+ baseline warnings tolerated
  (mostly `@typescript-eslint/no-non-null-assertion` and
  `@typescript-eslint/consistent-type-imports`)
- TypeScript: strict, no errors
- Vitest: server ~750+ tests, client ~80 tests; both must be 0-failed
- Build: client (Vite + tsc) + server (tsc)

For Prisma changes also run:

```bash
DATABASE_URL='postgresql://x:x@x/x' npx prisma validate
DATABASE_URL='postgresql://x:x@x/x' npx prisma format --check
```

CI's `prisma-validate` job additionally applies migrations to a throwaway
Postgres + runs a drift check, so any local-only schema edit will fail CI
without a matching migration.

## Active phase

Phase 12 (operational maturity). 10 sub-phases tracked in
`progress/phase-12-kickoff.md`. Status (as of last session):

| Sub-phase | Status |
|---|---|
| 12.2 Prometheus `/metrics` | shipped (PR #87) |
| 12.5a Bundle-size budget gate | shipped (PR #88) |
| 12.4 Synthetic uptime probe | not started — independent |
| 12.5b Code-split heaviest pages | not started — chases <500 KB target |
| 12.6 EXPLAIN-ANALYZE harness | not started — independent |
| 12.8 procurement-engine decomposition | not started — independent |
| 12.9 DB-backed integration tests | not started — independent |
| 12.10 Coverage gate | not started — needs Q4 (ratchet vs measure-only) |
| 12.1 OpenTelemetry tracing | blocked on Q1 (tracing destination) |
| 12.3 SLO burn-rate alerts | blocked on Q3 (target firmness) |
| 12.7 AI cost guardrail | blocked on Q2 (cost defaults) |

Phase 11 (privacy + SSO production hardening) is closed. Outstanding
follow-ups: domain-normalization case-insensitivity (deferred from PR #85),
S3 composable session middleware (deferred from PR #86 — needs design
sign-off).

## Doc map

| File | Use when |
|---|---|
| `README.md` | Onboarding overview |
| `AGENTS.md` | Cursor / agent-runner setup commands |
| `CONTRIBUTING.md` | Contribution workflow basics |
| `RUNBOOK.md` | Day-two operations, env-var matrix, metrics, health checks |
| `PRODUCTION_READINESS.md` | Operational-readiness gaps + SLO proposals |
| `HERM_COMPLIANCE.md` | Licence invariants you must preserve |
| `AI_GOVERNANCE.md` | AI-call audit + cost posture |
| `ARCHITECTURE_NOTES.md` | High-level design notes |
| `PROCUREMENT_WORKFLOW.md` | Domain-model overview for procurement surfaces |
| `DEMO.md` | Walkthrough script for product demos |
| `docs/adr/0001-sso-architecture.md` | SSO invariants — required reading before SSO surface work |
| `progress/phase-*.md` | Per-phase planning docs and retrospectives |
