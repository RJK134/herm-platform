# Future Horizons ASPT

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
cp .env.example .env            # ports already aligned to docker-compose
docker compose up -d            # local Postgres + Redis
npm run demo:bootstrap          # install + prisma generate/push + full seed
npm run dev                     # client + server concurrently
```

Or, on Linux/macOS, the same flow as a one-shot:

```bash
./start.sh
```

Open `http://localhost:5173`. Demo credentials and the colleague-review
walkthrough live in [DEMO.md](DEMO.md). Day-two ops in [RUNBOOK.md](RUNBOOK.md).

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
- `GET /api/readiness` — readiness (checks DB; also Redis when `REDIS_URL` is set). Returns 503 if any dependency is unhealthy. Available under `/api/ready` as a short-form alias.
- Every response carries an `x-request-id` header; every structured log line carries the same id for correlation.

## Docs

- [DEMO](DEMO.md) — five-minute demo bootstrap, demo credentials, colleague-review walkthrough
- [RUNBOOK](RUNBOOK.md) — start/stop, env-var matrix, migrations, incident responses, rollback drills
- [HERM_COMPLIANCE](HERM_COMPLIANCE.md) — how this codebase honours CC-BY-NC-SA-4.0: attribution surfaces, tier classification, release-time audit checklist
- [PROCUREMENT_WORKFLOW](PROCUREMENT_WORKFLOW.md) — project-status state machine, shortlist decision governance, scoring provenance
- [PRODUCTION_READINESS](PRODUCTION_READINESS.md) — quality gates, known gaps, go-live checklist
- [ARCHITECTURE_NOTES](ARCHITECTURE_NOTES.md) — module boundaries, data flow, auth model
- [AI_GOVERNANCE](AI_GOVERNANCE.md) — allowlists, limits, how to add a new AI surface
- [docs/adr/0001-sso-architecture.md](docs/adr/0001-sso-architecture.md) — SSO (SAML/OIDC) architecture, decisions, deferred items
- [docs/USER_TESTING_BRIEF.md](docs/USER_TESTING_BRIEF.md) — persona-driven user testing brief

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
