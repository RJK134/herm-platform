# Production Readiness

This document tracks what is in place to run HERM Platform in production and
what is explicitly deferred. Update it as gaps close or new ones surface.

## HERM licence compliance

- **Attribution carried with the data.** Framework-scoped API responses include a `meta.provenance.framework{…}` block (`server/src/lib/provenance.ts`). Export CSVs carry `x-framework-*` response headers. The client renders `<LicenceAttribution />` on the main HERM pages and a persistent `<LicenceFooter />` in the app shell for every other page.
- **HERM stays free.** `frameworkContext` middleware falls back to the first **public** active framework; `tierGate` passes all public frameworks through regardless of user tier. Subscription copy lists no HERM-specific paid gate.
- **Commercial gates are typed.** `requirePaidTier` middleware (in `server/src/middleware/require-paid-tier.ts`) returns `403 SUBSCRIPTION_REQUIRED` with `details.requiredTiers` for targeted upgrade CTAs; currently applied enterprise-only to `/api/framework-mappings/*` and `/api/keys/*`.
- Authoritative route-tier mapping + release-time audit checklist: [HERM_COMPLIANCE.md](./HERM_COMPLIANCE.md).

## Quality gates

- **Lint** — ESLint 9 flat config; `@typescript-eslint/no-explicit-any: error`.
- **Typecheck** — `tsc --noEmit` per workspace; TypeScript strict mode on.
- **Test** — Vitest + Supertest for the server, Vitest + Testing Library for
  the client. Baseline covers: health, readiness (DB-up and DB-down), auth
  enforcement on `/api/chat` and `/api/baskets`, Zod validation, request ID
  propagation, and client-side `ProtectedRoute` redirection.
- **Build** — `npm run build` runs `tsc` (server) and `tsc && vite build`
  (client).
- **CI** — `.github/workflows/ci.yml` runs lint, typecheck, test, and build
  on every PR and push to `main`, with a Postgres 16 and Redis 7 service
  container for future DB-backed tests.

## Security

- **Auth** — JWT (HS256, 7-day expiry). `authenticateJWT` middleware on every
  authenticated route; `requireRole` for admin / institution-admin gates.
  Baskets and chat are now authenticated (previously open).
- **Secrets** — `JWT_SECRET` and `ANTHROPIC_API_KEY` fail fast at startup in
  production. Secrets are redacted from logs via pino redact paths.
- **Rate limiting** — global 300 req/min per IP, tighter 20/15min for auth,
  tighter 20/min for chat (LLM cost control).
- **Helmet CSP** — strict `default-src 'self'`; no `unsafe-inline` or
  `unsafe-eval`.
- **CORS** — single allowed origin via `FRONTEND_URL`.

## Observability

- **Structured logging** — pino root logger, pino-http middleware, pino-pretty
  in dev only. JSON lines in prod for log aggregators.
- **Request IDs** — `requestId` middleware sets `req.id` from the incoming
  `x-request-id` header or a fresh UUID; echoes it on responses and attaches
  it to every log line.
- **Standard log fields** — `time, level, service, req.id, req.userId,
  req.method, req.url, res.statusCode, responseTime, err`.
- **AI telemetry** — `ai-assistant.ts` logs `{ model, inputTokens,
  outputTokens, durationMs, stopReason }` for every successful call and
  `{ err, durationMs }` on failure.

## Health checks

- `GET /api/health` — liveness; no dependencies, always returns 200 if the
  process is responsive.
- `GET /api/readiness` — executes `SELECT 1` against Postgres; 200 on success,
  503 with `checks: { db: 'fail' }` on failure. Wire this to your load
  balancer / orchestrator's readiness probe.

## Operational safety

- **Graceful shutdown** — SIGTERM/SIGINT close the HTTP server, disconnect
  Prisma, then exit. Force-exit at 10 s.
- **AI timeouts** — Anthropic calls are wrapped in an `AbortController` with
  a 30 s wall-clock timeout.
- **Client timeouts** — axios instance has a 15 s per-request timeout and a
  global 401 interceptor that clears stale tokens and redirects to `/login`.
- **Client errors** — `ErrorBoundary` catches render errors; axios 5xx errors
  surface once via a toast.

## Deferred / Known gaps

- **Service decomposition** — `services/procurement-engine.ts` (~764 LOC) and
  a few 350–450 LOC API services remain monolithic. The plan is to split into
  `services/domain/procurement/{scoring,tco,weighting,recommendations}.ts`
  with index re-exports so imports don't change. Held until the test baseline
  is broader.
- **Seed decomposition** — `prisma/seeds/vendor-profiles.ts` (~708 LOC) is
  still a single file. Split per-vendor once tests cover seed idempotency.
- **DB-backed tests** — auth register/login and scoring pure-function tests
  require a running Postgres (CI provides one). Add once the test DB strategy
  is documented.
- **Pre-commit hooks** — husky + lint-staged would be a cheap further gate.
- **Bundle size** — client JS bundle is ~1 MB. Code-split the heavy pages
  (ProcurementProjects, ProcurementGuide) before public launch.
- **Coverage gating** — vitest collects coverage on demand but CI does not
  enforce a threshold yet.

## SLOs (proposed)

- Availability: 99.5% (excluding planned maintenance).
- API p95 latency: < 500 ms for read endpoints, < 1500 ms for AI chat.
- Readiness probe: must flip to 503 within 30 s of DB loss.

## Incident response (starter)

1. Check `/api/readiness` — identifies DB/cache dependency failures.
2. Grep logs by `req_id` to trace a single request end-to-end.
3. Inspect AI cost spikes via the `ai.chat completed` log field aggregates.
4. Roll back via the RUNBOOK's "Rolling back a deploy" section.
