# HERM Platform

Higher-education procurement intelligence: score, compare and shortlist SIS/LMS/CRM/HCM systems against the UCISA HERM v3.1 reference model (165 business capabilities).

## Stack

- **Backend:** Express (TypeScript, strict) + Prisma + PostgreSQL
- **Frontend:** React 18 + Vite + TanStack Query + Tailwind
- **Auth:** JWT (7-day), bcrypt password hashes
- **AI:** Anthropic Claude (bounded via a single governed client — see [AI_GOVERNANCE](docs/AI_GOVERNANCE.md))
- **Payments:** Stripe (optional — graceful degradation when unconfigured)

## Prerequisites

- Node 20+
- Docker (for local Postgres + Redis via `docker-compose.yml`)

## Quick start

```bash
cp .env.example .env            # fill in JWT_SECRET, DATABASE_URL, etc.
docker compose up -d            # local Postgres + Redis
npm install
npm run db:generate
npm run db:push
npm run db:seed                 # ~165 capabilities, 21 systems, vendor profiles
npm run dev                     # client + server concurrently
```

Open `http://localhost:5173`.

## Quality gates

```bash
npm run verify          # lint + typecheck + test + build across workspaces
npm run lint            # ESLint (flat config)
npm run typecheck       # tsc --noEmit in both workspaces
npm run test:ci         # Vitest, non-interactive
npm run format:check    # Prettier
```

CI runs the same gates on every push/PR — see `.github/workflows/ci.yml`.

## Health & readiness

- `GET /api/health` — liveness (process up)
- `GET /api/ready` — readiness (checks DB). Returns 503 if any dependency is unhealthy.
- Every response carries an `x-request-id` header; every structured log line carries the same id for correlation.

## Docs

- [PRODUCTION_READINESS](docs/PRODUCTION_READINESS.md) — quality gates, known gaps, go-live checklist
- [ARCHITECTURE_NOTES](docs/ARCHITECTURE_NOTES.md) — module boundaries, data flow, auth model
- [RUNBOOK](docs/RUNBOOK.md) — start/stop, migrations, incident responses
- [AI_GOVERNANCE](docs/AI_GOVERNANCE.md) — allowlists, limits, how to add a new AI surface

## Project layout

```
.
├── client/          # React + Vite SPA
├── server/          # Express API
│   └── src/
│       ├── api/             # route modules grouped by domain
│       ├── middleware/      # requestId, auth, validate, errorHandler, security
│       ├── services/
│       │   ├── ai/          # AI client (only place allowed to import @anthropic-ai/sdk)
│       │   ├── domain/      # business-logic services (procurement-engine, …)
│       │   └── integration/ # external services (stripe, …)
│       ├── lib/             # logger, respond helpers
│       └── utils/           # errors, prisma client, pagination
├── prisma/          # schema + seed orchestrator
│   └── seeds/
│       ├── capabilities-data.ts       # 165 HERM capabilities
│       └── vendor-profiles/           # split vendor-profile / research / methodology data
├── docs/            # architecture / readiness / runbook / AI governance
└── .github/workflows/ci.yml
```
