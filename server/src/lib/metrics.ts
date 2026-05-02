/**
 * Prometheus metrics registry (Phase 12.2).
 *
 * Single source of truth for every metric the platform exposes. The
 * `/metrics` endpoint scrapes this registry and emits text-format
 * Prometheus output. Module-level state is intentional: the Registry
 * must be a singleton so two callers incrementing the same counter
 * actually share state.
 *
 * Metric design notes:
 *
 *   1. **Label cardinality**. Every metric has a fixed, low-cardinality
 *      label set. Avoid putting user IDs, JWT claims, or institution
 *      slugs into labels — they would explode the cardinality and make
 *      the time-series database unhappy. Where per-tenant breakdowns
 *      are needed (e.g. AI cost in 12.7), the limit is enforced at
 *      registration time by an `aggregateBy` switch, not by a free-
 *      form label.
 *
 *   2. **Route labels** use the Express route pattern (`/api/users/:id`)
 *      rather than the raw URL (`/api/users/abc-123`). The middleware
 *      reads `req.route.path` post-routing so dynamic IDs collapse.
 *
 *   3. **No PII in any label.** Metrics responses are public on the
 *      scraping network — assume any production deployment exposes
 *      this on a separate, internally-routed port. See the README
 *      note in `RUNBOOK.md`.
 *
 *   4. **HERM compliance invariants.** No metric label may carry
 *      framework `id` / `code` / publisher details that would let an
 *      observer correlate metrics with restricted-tier framework
 *      access. Per `HERM_COMPLIANCE.md`, framework rows themselves
 *      are public, but tier-gating decisions are not — keep the
 *      tier-gate outcome out of metric labels.
 */
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * The application Registry. Tests reset it via `__resetMetricsForTests`.
 * Production code never needs to touch it directly — go through the
 * exported helpers (`observeHttpRequest`, `recordAuthLogin`, etc.).
 */
export const registry = new Registry();

// Default Node.js + process metrics: heap usage, event loop lag, FD
// counts, GC pauses. Cheap (<1ms per scrape) and gives ops the standard
// runtime view without per-app instrumentation.
collectDefaultMetrics({ register: registry, prefix: 'herm_' });

/**
 * Standard HTTP request duration histogram. Labels are deliberately
 * tight: method (GET/POST/...), route (Express route pattern), status
 * (numeric HTTP status as a string). Buckets cover the SLO range
 * (`PRODUCTION_READINESS.md` proposes p95 < 500ms read / 1500ms AI
 * chat) plus tails for slower routes.
 */
export const httpRequestDurationSeconds = new Histogram({
  name: 'herm_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/**
 * Standard HTTP request total counter. Used for RED-method dashboards
 * (Rate, Errors, Duration). Pairs with the histogram above.
 */
export const httpRequestsTotal = new Counter({
  name: 'herm_http_requests_total',
  help: 'Total HTTP requests handled',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

/**
 * In-flight request gauge. Useful for spotting saturation: when this
 * trends above worker-thread-count for sustained periods, the server
 * is queueing.
 */
export const httpRequestsInFlight = new Gauge({
  name: 'herm_http_requests_in_flight',
  help: 'Number of HTTP requests currently being handled',
  labelNames: ['method'] as const,
  registers: [registry],
});

// ── Domain counters (Phase 12.2 starter set) ───────────────────────────────
//
// Two domain counters land in this PR as proof of the pattern:
// auth.login outcomes and SSO login outcomes. Remaining counters from
// the kickoff doc (ai.chat.completed token counts, retention sweep
// counts, sso.slo revocations) ship in follow-up Phase 12 PRs against
// their respective controllers.

/**
 * Local password-login attempts. Outcome buckets:
 *   - `success`    — credentials valid, lockout not engaged, MFA passed
 *   - `bad_credentials` — wrong password OR unknown email (callers
 *     must NOT distinguish to a metric — `auth.service.ts` already
 *     emits the same generic 401 message)
 *   - `locked`     — lockout window engaged
 *   - `mfa_required` — credentials valid but TOTP step pending
 *   - `mfa_failed` — TOTP step failed
 */
export const authLoginTotal = new Counter({
  name: 'herm_auth_login_total',
  help: 'Local password-login attempts by outcome',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

/**
 * SSO login attempts. Labels are protocol (saml/oidc) and outcome
 * (success / discovery_404 / validation_failure / replayed / cross_inst_blocked).
 * Crucially does NOT label by institutionSlug — that's the SSO
 * tier-rejection invariant per `docs/adr/0001-sso-architecture.md`:
 * an external observer of metrics must not be able to enumerate
 * which tenants have SSO configured.
 */
export const ssoLoginTotal = new Counter({
  name: 'herm_sso_login_total',
  help: 'SSO login attempts by protocol and outcome',
  labelNames: ['protocol', 'outcome'] as const,
  registers: [registry],
});

// ── Helper functions (the public API for instrumentation) ──────────────────

/**
 * Observe a completed HTTP request. Called by the metrics middleware;
 * direct callers shouldn't need this.
 */
export function observeHttpRequest(
  method: string,
  route: string,
  status: number,
  durationSeconds: number,
): void {
  const labels = { method, route, status: String(status) };
  httpRequestDurationSeconds.observe(labels, durationSeconds);
  httpRequestsTotal.inc(labels);
}

/**
 * Record a local password-login attempt. Outcome strings are the closed
 * set documented on `authLoginTotal` — adding new outcomes requires a
 * dashboard update so they're not free-form.
 */
export function recordAuthLogin(
  outcome: 'success' | 'bad_credentials' | 'locked' | 'mfa_required' | 'mfa_failed',
): void {
  authLoginTotal.inc({ outcome });
}

/**
 * Record an SSO login attempt. Same closed-set discipline as
 * `recordAuthLogin`.
 */
export function recordSsoLogin(
  protocol: 'saml' | 'oidc',
  outcome:
    | 'success'
    | 'discovery_404'
    | 'validation_failure'
    | 'replayed'
    | 'cross_inst_blocked',
): void {
  ssoLoginTotal.inc({ protocol, outcome });
}

/**
 * Render the current registry to Prometheus text format. The
 * `/metrics` route consumes this.
 */
export async function renderMetrics(): Promise<string> {
  return registry.metrics();
}

/**
 * Test hook: clear all metrics so per-test state doesn't bleed across
 * test cases. Resets counters/gauges/histograms but preserves
 * registration (so re-importing helpers post-reset still works).
 */
export function __resetMetricsForTests(): void {
  registry.resetMetrics();
}
