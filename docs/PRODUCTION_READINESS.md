# Production readiness

This document captures what's in place, what's deliberately deferred, and what must be true before a deployment is considered production-ready.

## What's in place

### Quality gates
- **Lint** — ESLint 9 flat config with `@typescript-eslint`, React-Hooks rules, and an `no-restricted-imports` rule that forbids direct `@anthropic-ai/sdk` imports outside `server/src/services/ai/`.
- **Typecheck** — `tsc --noEmit` per workspace; server uses `strict: true`.
- **Test** — Vitest (server: node env + Supertest; client: jsdom + React Testing Library).
- **Format** — Prettier (`.prettierrc.json`).
- **CI** — `.github/workflows/ci.yml` runs lint, format-check, typecheck, test, build, and Prisma schema validation on every push/PR.

### Backend hardening
- Centralised error handler now maps `ZodError`, `AppError`, and `Prisma.PrismaClientKnownRequestError` (P2002 → 409, P2025 → 404, P2003 → 409) onto a consistent `{ success, error: { code, message, details?, requestId } }` envelope.
- Every request carries an `x-request-id` (accepted from header or generated via `nanoid`) and every structured log line includes the same id via `pino-http`.
- `/api/health` (liveness) and `/api/ready` (readiness, checks Prisma) are separated. Readiness returns 503 when dependencies are down.
- Authentication / authorization backfilled on `/api/research` (admin-only mutations), `/api/vendors/:id/profile` (admin/vendor-admin for PUT), and `/api/chat` (fully authenticated + session-ownership enforced — see [AI_GOVERNANCE](AI_GOVERNANCE.md)).
- Zod schemas added for previously unvalidated mutation routes (research, vendor profile updates).

### Service layer separation
Services are organised by responsibility:
- `server/src/services/ai/` — AI wrapper + assistant. Only module allowed to import `@anthropic-ai/sdk`.
- `server/src/services/integration/` — external integrations (Stripe).
- `server/src/services/domain/` — business rules (procurement engine).

The flat paths (`services/ai-assistant.ts`, etc.) remain as one-line re-exports for backward compatibility.

### Seed / bootstrap refactor
`prisma/seeds/vendor-profiles.ts` (708 LoC) split into:
- `types.ts`
- `profiles-data.ts`
- `research-items-data.ts`
- `scoring-methodology-data.ts`
- `upsert.ts`
- `index.ts` (orchestrator)

`prisma/seed.ts` shrunk from 392 → ~200 LoC by extracting the 165-capability catalogue to `prisma/seeds/capabilities-data.ts`.

### Client resilience
- Existing `ProtectedRoute` wired into authed routes in `client/src/App.tsx`. Admin-only pages use `roles={['INSTITUTION_ADMIN','SUPER_ADMIN']}`.
- Axios response interceptor in `client/src/lib/api.ts` normalises errors into `ApiError` (carrying `requestId`), clears the stored token on 401, and redirects to `/login?returnTo=<path>`.
- `AsyncBoundary` helper provides consistent loading / error / empty rendering for React Query pages.

### Test baseline
- `server/src/__tests__/`:
  - `validate.middleware.test.ts` — body/query/params validation.
  - `errorHandler.test.ts` — Zod / AppError / unknown mapping with request-id propagation.
  - `requestId.test.ts` — header pass-through, generation, length cap.
  - `routeProtection.test.ts` — 401 for missing / malformed tokens.
  - `health.test.ts` — `/api/health` 200, `/api/ready` 200/503 with mocked Prisma.
  - `aiClient.test.ts` — allowlist, sanitiser, configuration gate, SDK call shape.
- `client/src/__tests__/`:
  - `ProtectedRoute.test.tsx` — redirect / render / role-deny.
  - `apiInterceptor.test.ts` — `ApiError` shape + 401 redirect contract.

## Known gaps (deferred)

1. **Client `noUnusedLocals` / `noUnusedParameters`** — disabled to avoid touching ~30 pages in this pass. ESLint still flags unused vars. Re-enable in a follow-up.
2. **Prettier** — config is in place (`.prettierrc.json`) but CI does not enforce `format:check` yet. The pre-existing codebase has formatting drift across ~146 files; a single dedicated `prettier --write .` PR should land that separately. `npm run verify:strict` runs format-check locally for anyone wanting to preview.
2. **Integration tests** — no end-to-end Supertest-against-Prisma tests. Adding these requires a test DB (e.g. pg-mem or a dedicated schema). Tracked for the next pass.
3. **Broad route coverage** — validation backfilled on the most exposed routes. Routes `architecture`, `documents`, `value`, `evaluations`, `vendor-portal`, and parts of `admin` still rely on inline or absent schemas.
4. **Procurement engine split** — `procurement-engine.ts` (764 LoC) was moved into `services/domain/` but not yet split into `stages.ts` / `compliance.ts` / `timeline.ts`. Defer until there's an incoming change that touches it.
5. **Observability backend** — pino logs go to stdout. No Prometheus / OpenTelemetry / structured sink. Metrics port is stubbed via the AI client's log lines.
6. **Chat anonymous session backfill** — enforcing auth on `/api/chat` means historical `ChatMessage` rows with `userId = null` are unreachable by authenticated users. A follow-up migration may choose to delete them.
7. **Rate limiting per-user** — currently global (300/min) and per-IP on auth. No per-user quota on AI chat (deferred to cost-tracking work).

## Go-live checklist

- [ ] `JWT_SECRET` is ≥ 32 bytes of entropy and set in the deploy environment.
- [ ] `DATABASE_URL` points at a managed Postgres with backups.
- [ ] `FRONTEND_URL` is set to the production domain (CORS origin).
- [ ] `NODE_ENV=production`.
- [ ] `ANTHROPIC_API_KEY` is either set (chat works) or intentionally absent (chat degrades to a help message).
- [ ] Stripe keys set (or intentionally absent — subscriptions degrade to a "not configured" response).
- [ ] `npm run verify` passes locally and in CI.
- [ ] `GET /api/ready` returns 200 from the deploy target.
- [ ] Log aggregation (stdout → log sink) configured.
- [ ] Container stop signal is SIGTERM so the graceful-shutdown path runs.
- [ ] Prisma migrations applied (`npx prisma migrate deploy`).
