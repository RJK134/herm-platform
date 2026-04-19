# HERM Platform

A capability-driven procurement platform for UK higher-education IT systems,
structured around the UCISA HERM v3.1 framework (165 capabilities across 11
families) with vendor scoring, TCO modelling, procurement workflow, and an
AI assistant.

## Stack

- **Client**: React 18, Vite 5, TypeScript, TanStack Query, React Router v6,
  Tailwind, Chart.js.
- **Server**: Node 20, Express 4, TypeScript, Prisma 5 (PostgreSQL), Zod,
  JWT auth, Pino (structured logging), Anthropic SDK, Stripe.
- **Dev infra**: Docker Compose (Postgres 16 + Redis 7).

## Quickstart

```bash
# 1. Install
npm install

# 2. Boot Postgres + Redis locally
docker-compose up -d

# 3. Configure secrets
cp .env.example .env
# then edit .env — at minimum set JWT_SECRET, DATABASE_URL, ANTHROPIC_API_KEY

# 4. Apply the Prisma schema and seed reference data
npm run db:push
npm run db:seed

# 5. Run client + server
npm run dev
# client: http://localhost:5173
# api:    http://localhost:3002
```

## Scripts

| Command              | What it does                                             |
|----------------------|----------------------------------------------------------|
| `npm run dev`        | Concurrent client (5173) + server (3002) with hot reload |
| `npm run build`      | Type-check + Vite build (client) and `tsc` (server)      |
| `npm run lint`       | ESLint across both workspaces                            |
| `npm run typecheck`  | `tsc --noEmit` in each workspace                         |
| `npm test`           | Vitest + Supertest suite                                 |
| `npm run format`     | Prettier write                                           |
| `npm run db:push`    | Apply Prisma schema to the database                      |
| `npm run db:seed`    | Seed HERM capabilities, vendors, and demo data           |
| `npm run db:studio`  | Open Prisma Studio                                       |

## Environment variables

See `.env.example`. Key variables:

- `DATABASE_URL` — Postgres connection string.
- `JWT_SECRET` — required in production; dev uses an insecure fallback.
- `ANTHROPIC_API_KEY` — required in production; dev returns a fallback reply.
- `STRIPE_*` — optional; if absent, payment endpoints surface a friendly
  "not configured" response.
- `FRONTEND_URL` — CORS origin (default `http://localhost:5173`).
- `LOG_LEVEL` — pino level (default `info` in prod, `debug` in dev).

## Testing

```bash
npm test               # all workspaces
npm run test:server    # server only
npm run test:client    # client only
```

The server test suite mocks `utils/prisma` so it runs without a database. CI
also provisions a Postgres service so DB-backed tests can be added over time.

## Documentation index

- [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) — what's in place, what's still deferred.
- [ARCHITECTURE_NOTES.md](./ARCHITECTURE_NOTES.md) — request lifecycle, auth flow, service layering.
- [RUNBOOK.md](./RUNBOOK.md) — day-two operations (migrations, log queries, rollback).
- [AI_GOVERNANCE.md](./AI_GOVERNANCE.md) — model, prompt, limits, cost controls.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — branching, PR checklist, coding style.

## Help

- `/help` — Claude Code usage (if applicable to your workflow).
- Issues — [github.com/anthropics/claude-code/issues](https://github.com/anthropics/claude-code/issues) (for agentic dev tooling feedback).
