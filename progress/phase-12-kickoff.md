# Phase 12 — Kickoff: Operational Maturity

**Date:** 2026-05-01
**Status:** Planning (proposal — open for product-owner sign-off)
**Target branch:** `claude/phase-12-kickoff` (this doc only; sub-phase branches per the established `claude/p12-<n>-<topic>` pattern)
**Scope unit:** ~10 sub-phases over 4–6 weeks

---

## Where we are

Phases 1–9 delivered the procurement intelligence product (scoring, baskets, sector analytics, vendor portal, multi-jurisdiction procurement, Stripe billing, i18n, API keys). Phase 10 added the auth core (lockout, MFA, impersonation). Phase 11 wrapped the privacy + SSO production-grade work — SAML + OIDC flows, SCIM 2.0, SAML SLO, UKAMF cert auto-rotation, multi-IdP per tenant, soft-delete cascades for User/Institution/Subscription with a retention scheduler.

The "deferred follow-ups" list from the prior carry-over is now empty. The platform is feature-complete for v1 launch to UK higher-ed customers.

What's left is **operational maturity** — closing the gap between "works in staging" and "we can put it under an SLA".

## Thesis

Phase 12 should not add customer-visible features. It should harden what we have so that:

1. We can answer "is the platform healthy?" with a dashboard, not a grep.
2. Performance budgets exist and are enforced in CI.
3. AI cost cannot run away on a single tenant.
4. The deferred items in `PRODUCTION_READINESS.md` are closed out.

This is a deliberate engineering-led phase. It's not glamorous, but it's what gives us the confidence to sign SLAs.

## Proposed workstreams

| ID    | Title                                                                                  | Effort |
| ----- | -------------------------------------------------------------------------------------- | ------ |
| 12.1  | OpenTelemetry tracing wiring (server) + propagation contract                           | M      |
| 12.2  | Prometheus `/metrics` endpoint + RED-method dashboards (Grafana JSON in repo)          | M      |
| 12.3  | Implement the SLOs proposed in `PRODUCTION_READINESS.md` with error-budget burn alerts | M      |
| 12.4  | Synthetic uptime probe + readiness drift alarm                                         | S      |
| 12.5  | Bundle-size budget in CI; lazy-load the four heaviest pages                            | M      |
| 12.6  | Postgres slow-query log + EXPLAIN-ANALYZE harness for the top 20 endpoints             | M      |
| 12.7  | AI cost guardrail — per-institution daily ceiling with soft + hard limits              | M      |
| 12.8  | Service decomposition: split `services/procurement-engine.ts` (~764 LOC)               | M      |
| 12.9  | DB-backed integration test suite (auth register/login + scoring pure-fns)              | M      |
| 12.10 | Coverage threshold gating in CI (start at the current floor, then ratchet)             | S      |

S = ≤2 days. M = 3–7 days. L = >1 week (none in Phase 12).

### 12.1 – 12.4 Observability v2

The current observability story is structured logs + request IDs. That's enough to **debug** an incident but not enough to **detect** one. Concrete deliverables:

- **12.1** OpenTelemetry SDK in the server, OTLP exporter (destination per the open question below). Trace IDs flow into the JSON log lines so logs and traces correlate. Propagate `traceparent` end-to-end (client → server → Postgres via `pg-promise`-equivalent hook, AI calls via Anthropic SDK header).
- **12.2** A `/metrics` endpoint exposing standard Express request metrics (count, latency histogram, in-flight) plus domain counters (`auth.login.success`, `sso.login.success`, `ai.chat.completed` token counts, `retention.sweep.userPurged`, `sso.slo.revocations`).
- **12.3** A Grafana dashboard JSON committed to `infra/grafana/` so deployments can import it. Three panels: availability (readiness probe), API p95 latency by route, AI cost spend by tenant. Burn-rate alerts on the proposed SLOs (99.5% availability → 0.5% error budget over 30 days; alert at 2x and 14x burn rates).
- **12.4** Synthetic probe (cron-driven `curl /api/readiness`) with a separate-region origin so we catch network-path failures, not just app-layer ones.

### 12.5 – 12.7 Performance & cost

`PRODUCTION_READINESS.md` notes the bundle is ~1MB. Target: <500KB initial via route-based code-splitting on the four heaviest pages (`ProcurementProjects`, `ProcurementGuide`, `SectorAnalytics`, `AdminSystems`). Add a `bundlewatch` step to CI so regressions don't slip in.

Postgres slow-query: enable `pg_stat_statements` in the docker-compose Postgres, run a fixed query workload, document the top 20 endpoints' `EXPLAIN ANALYZE` plans, and index where indicated. A `prisma/perf-baseline/` directory holds the captured plans so future regressions are reviewable.

AI cost guardrail: today the only protection is `RATE_LIMIT_*` per tier — IP-scoped, not institution-scoped. Add a daily token budget per institution (defaults below, configurable per tier) with a soft warning at 80% and a hard 429 at 100%. Surface usage on the institution admin page.

### 12.8 – 12.10 PRODUCTION_READINESS gap closure

The "Deferred / Known gaps" section has been there since Phase 6. Close it:

- **12.8** Split `services/procurement-engine.ts` into `services/domain/procurement/{scoring,tco,weighting,recommendations}.ts` with index re-exports — imports stay stable.
- **12.9** DB-backed tests for auth register/login + scoring pure-functions. CI's Postgres-16 service container is already wired; we just have to use it.
- **12.10** Coverage threshold in vitest config. Start measure-only for one cycle to establish the floor, then ratchet to enforcing.

## Out of scope (explicit)

These are good ideas but **not Phase 12**:

- **SOC2 Type II / ISO 27001 prep** — strong Phase 13 candidate. Multi-quarter; needs vendor-risk register, access-review cadence, asset inventory, BCP/DR drill log. Defer until a customer needs the report.
- **AI assistant v2** (persistent threads, framework-aware citations, document summarisation) — needs product direction.
- **Public API v2** (webhooks, OAuth2 client credentials, Zapier connector) — needs a customer-demand signal beyond the existing API-key surface.
- **Mobile / responsive UX overhaul** — needs UX research.
- **Real-time workspace collaboration** — heavy build (CRDT or operational-transform); warrants its own multi-phase block.
- **HERM v3.2 sync with CAUDIT** — UCISA HERM v3.2 isn't out yet; manual import via `prisma/seeds/` works for now.

## Open questions for product-owner sign-off

1. **Tracing destination.** Honeycomb, Grafana Cloud, Datadog, or self-hosted Tempo? Affects 12.1's exporter config and the deploy story (one extra env var per choice).
2. **AI cost ceiling defaults.** Suggested: free tier 100K input + 25K output tokens/day/institution; professional 1M+250K; enterprise unlimited but alert at 5M/day. Too tight, too generous, wrong shape?
3. **SLO target firmness.** `PRODUCTION_READINESS.md` proposes 99.5% availability and p95 < 500ms (read) / < 1500ms (AI chat). Are those the numbers we'd hold ourselves to in a customer SLA?
4. **Coverage floor.** Should 12.10 ratchet aggressively (block PRs that drop coverage) or measure-only for one cycle then enforce?

## Success criteria

Phase 12 is done when:

- [ ] `/metrics` endpoint exposes the seven core counters and the latency histogram
- [ ] Grafana dashboard JSON in `infra/grafana/`, importable via `grafana-cli`
- [ ] Burn-rate alerts on availability + p95 latency, with documented runbook entries
- [ ] Bundle size < 500KB initial; CI fails PRs that regress past the threshold
- [ ] Postgres slow-query log captured for the top 20 endpoints; index regressions documented
- [ ] AI cost guardrail enforced per-institution; usage visible on the admin dashboard
- [ ] `services/procurement-engine.ts` decomposed; existing tests pass against new module boundaries
- [ ] DB-backed integration tests green in CI
- [ ] Coverage gate active (threshold per the open-question answer)
- [ ] `PRODUCTION_READINESS.md` "Deferred / Known gaps" section is reduced to zero items, or each remaining item carries a Phase 13+ tracking link

## Invariants this phase must preserve

Per `HERM_COMPLIANCE.md`:

- HERM capability data stays free at every tier and to anonymous callers.
- Provenance / attribution travels with the data.
- `tierGate` continues to pass public frameworks through unconditionally — performance/cost work must not introduce a "fast path" that bypasses these middlewares.

Per the SSO surface invariants (see `docs/adr/0001-sso-architecture.md` and the codebase):

- Opaque 404 (not 403) on SSO tier-rejection — observability work must not leak the rejection reason via metrics labels or trace tags.
- IdP owns SSO credential-failure lockout — don't add lockout instrumentation that double-counts.
- MFA bypass on SSO is intentional (`mfaBypassed: true` audited).

## After Phase 12 (preview)

Likely Phase 13 candidates, in rough priority order:

1. **Compliance prep (SOC2 Type II)** — once a customer asks
2. **AI assistant v2** — once product direction is set
3. **Public API v2 (webhooks, OAuth2 client credentials)** — once a customer asks
4. **HERM v3.2 sync** — once CAUDIT releases
5. **Mobile / responsive overhaul** — once UX research justifies

## References

- `PRODUCTION_READINESS.md` — current operational posture + SLO proposal (lines 90–95) + "Deferred / Known gaps"
- `RUNBOOK.md` — env-var matrix, deploy/rollback drills (Phase 12 will add tracing-destination envvars)
- `HERM_COMPLIANCE.md` — invariants Phase 12 must preserve
- `progress/phase-6-launch.md` — last "operational" phase doc; this builds on its security/i18n foundation
- `docs/adr/0001-sso-architecture.md` — SSO architecture (informs 12.1's trace-tag and metric-label hygiene)
