# HERM platform — demo runbook

Concise walkthrough for running the platform inside a fresh GitHub workspace
(or any clean Linux/macOS shell with Docker installed). For day-two operations
see [RUNBOOK.md](RUNBOOK.md); for the persona-driven test brief see
[docs/USER_TESTING_BRIEF.md](docs/USER_TESTING_BRIEF.md).

## What you get

- Express API on `http://localhost:3002` (`/api/health`, `/api/readiness`)
- Vite SPA on `http://localhost:5173`
- PostgreSQL 16 via Docker on host port `5434`
- Redis 7 via Docker on host port `6380` (used by lockout + SSO flow store)
- A seeded demo institution + user — see "Demo credentials" below
- HERM v3.1 reference data (165 capabilities, 11 domains) plus FHE framework,
  vendor profiles, jurisdictions, capability baskets

## Prerequisites

- Node 20+
- Docker (`docker compose` or legacy `docker-compose`)
- Free host ports `3002`, `5173`, `5434`, `6380`

The bundled `docker-compose.yml` deliberately offsets Postgres/Redis to `5434`
and `6380` so the stack does not collide with anything you may already have
running on `5432`/`6379`. `.env.example` is already aligned to those ports;
`cp .env.example .env` is the only env step you need for the demo.

## One-shot bootstrap (recommended)

From a clean clone with Node 20+ and Docker installed:

```bash
npm run demo                        # cross-platform: dispatches to demo.sh / demo.bat
```

That single command:
1. Verifies Node + Docker are on PATH.
2. Copies `.env.example` → `.env` if missing.
3. Brings up PostgreSQL + Redis via `docker compose`.
4. Waits for Postgres to become healthy.
5. Runs `npm run demo:bootstrap` (install + Prisma generate + db push + full seed).
6. Prints demo credentials and runs `npm run dev` (foreground; Ctrl+C to stop).

Equivalent direct invocations: `./demo.sh` (Linux/macOS) or `demo.bat` (Windows).

When you are done:

```bash
./stop.sh                           # docker compose down (data volume is preserved)
```

### Manual / step-by-step alternative

If you'd rather run each step yourself (or the one-shot fails partway and you
want to resume):

```bash
cp .env.example .env                # ports already aligned to docker-compose
docker compose up -d                # postgres + redis
npm run demo:bootstrap              # install deps + prisma generate/push + full seed
npm run dev                         # starts client (5173) + server (3002)
```

`./start.sh` is a shorter daily-use variant — it skips `npm install` and the
seed (assumes you've already bootstrapped) and just brings the stack back up.

## Validate the demo is up

In a separate terminal once `npm run dev` is running:

```bash
npm run demo:validate
```

This hits `/api/health`, `/api/readiness`, and exercises the demo login. It
exits non-zero with actionable hints if anything fails.

Manual equivalents:

```bash
curl -i http://localhost:3002/api/health        # liveness — 200
curl -i http://localhost:3002/api/readiness     # readiness — 200, also at /api/ready
curl -s -X POST http://localhost:3002/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@demo-university.ac.uk","password":"demo12345"}' | head
```

## Demo credentials

| Field | Value |
|---|---|
| URL | http://localhost:5173 |
| Email | `demo@demo-university.ac.uk` |
| Password | `demo12345` (hard-coded in the seed default and surfaced as a hint on the Login page) |
| Role | `INSTITUTION_ADMIN` |
| Institution | Demo University (slug `demo-university`, tier `professional`) |

The Login page shows these credentials inline as a blue helper card — there is
nothing to memorise. Do **not** set `DEMO_PASSWORD` in `.env` for a demo run;
the helper card is hard-coded to the default and would otherwise mismatch.

### Seeing every Enterprise surface

Several capabilities (Sector Analytics, Framework Mapping, advanced procurement
exports) are tier-gated behind the Enterprise plan. Before billing lands, set
the unlock flag in your `.env`:

```
DEV_UNLOCK_ALL_TIERS=true
```

Restart the server. Every logged-in user is then issued a JWT carrying
`tier="enterprise"`, regardless of their institution's actual subscription.
`checkEnvironment()` warns loudly if this is left on in production.

## What works in this demo

| Surface | Status | Notes |
|---|---|---|
| Auth (email + password, JWT, lockout) | Working | Lockout uses Redis when `REDIS_URL` is set, in-memory otherwise |
| Account lockout | Working | 5 failures → 15 min cooldown; `auth.lockout.engaged` audit fires on the boundary |
| TOTP MFA enrolment + login | Scaffold | Endpoints + UI exist (`Settings → Security`), no enforcement policy |
| Impersonation banner | Working | SUPER_ADMIN-only; sticky amber banner with "End impersonation" |
| HERM browse / score / radar / leaderboard | Working | 165 capabilities seeded |
| Capability baskets + procurement projects | Working | State-machine driven (see PROCUREMENT_WORKFLOW.md) |
| Vendor profiles + comparison | Working | Seeded vendor profiles + research notes |
| AI Assistant | Working **only if** `ANTHROPIC_API_KEY` is set | Falls back to a clear error otherwise |
| Sector analytics | Working (Enterprise) | Self-excludes the caller's own institution |
| Framework mapping (HERM↔FHE) | Working (Enterprise) | |
| Stripe billing | Optional | Without `STRIPE_SECRET_KEY` the billing surface is read-only/no-op |
| GDPR export + erasure | Working | `/api/me/export`, `/api/me/erasure` |
| OpenAPI 3.1 spec | Working | `/api/openapi.json`, also under `/api/v1` |
| SSO discovery (`/api/sso/discover?email=`) | Working | Returns 200 with `available: false` for unknown domains |
| Full SAML / OIDC login | Working but inert | Requires a real `SsoIdentityProvider` row + IdP — not seeded for the demo |

## Demo script (10–15 min)

1. **Auth & first impression** — open `http://localhost:5173`, log in with the
   demo credentials. Note the `x-request-id` header on every API response and
   the structured JSON logs in the server terminal.
2. **HERM browse** — capabilities → pick a domain → drill into a capability.
   Show the licence attribution surfaces (HERM CC-BY-NC-SA-4.0 banner,
   per-capability licence chip).
3. **Vendor leaderboard + radar** — vendors page → leaderboard → pick three
   for a comparison radar. Show capability-coverage heatmap.
4. **Basket builder + procurement project** — build a basket, attach to a new
   procurement project, walk through the project state machine, generate an
   ITT-ready document.
5. **Sector analytics (Enterprise)** — only visible with `DEV_UNLOCK_ALL_TIERS=true`.
   Show the self-exclusion of the caller's institution from aggregates.
6. **AI Assistant** — ask "What does BC011 Admissions cover?" — only works when
   `ANTHROPIC_API_KEY` is set.
7. **Security surfaces** — Settings → Security: TOTP enrolment flow. Then
   `curl -X POST /api/auth/login` with a wrong password 5× and observe the
   lockout response on the 6th attempt.
8. **Health & ops** — `curl /api/health`, `/api/readiness`, `/api/openapi.json`.
   Show the `auth.lockout.engaged` event in the audit log table.

## Known limitations heading into the demo

These are **deliberately deferred** — call them out if asked, do not paper over:

- **At-rest encryption of `oidcClientSecret` / `samlCert`** — application-level
  envelope encryption (AES-256-GCM) is now implemented (Phase 11.2). Set
  `SSO_SECRET_KEY` (`openssl rand -hex 32`) and any newly-written SSO secret
  is stored as `enc:v1:...` ciphertext. Legacy plaintext rows still resolve
  (back-compat). Per-row key rotation and a one-shot encryption migration
  script remain follow-ups.
- **UKAMF compliance** — SP-side AuthnRequest signing + signed SP metadata
  are now wired (Phase 11.3). Set `SP_SIGNING_KEY` + `SP_SIGNING_CERT`
  (inline PEM or `file:/path/to.pem`) and `/api/sso/sp-metadata.xml` plus
  every outgoing AuthnRequest is signed with the configured keypair. Without
  the env pair the flow stays on the legacy unsigned path. Federation
  enrolment (uploading the signed SP metadata to UKAMF) and per-deployment
  cert-rotation tooling remain operator tasks.
- **Admin UI for `SsoIdentityProvider`** — Phase 11.4 ships an
  INSTITUTION_ADMIN page at `/admin/sso` for creating, editing, and
  deleting the institution's IdP row (SAML or OIDC). Secret fields use
  "stored — leave blank to keep" semantics; writes go through the
  envelope-encryption helper from Phase 11.2. (Closed.)
- **No live IdP integration tests** — `node-saml` and `openid-client` are
  mocked in the test suite. End-to-end against `saml-test-idp` /
  `oauth2-mock-server` is a deferred follow-up.
- **MFA bypass on SSO** — when an institution has SSO, authenticator-app MFA is
  no longer enforced by HERM; the IdP enforces its own MFA. This is by design
  (ADR-0001 Q10) and recorded in audit as `mfaBypassed: true`.
- **Soft-delete + retention scheduler** — deferred from PR #50.
- **SAML Single Logout (SLO)** — needs a Redis-backed session store; v1 skip.
- **Multi-IdP per tenant** — schema enforces one `SsoIdentityProvider` per
  institution today; relax later.
- **SCIM provisioning** — JIT provisioning covers the common case for now.
- **Bundle size** — the SPA main chunk is ~1.5 MB minified (440 KB gzip).
  Code-splitting is a known follow-up; not a demo blocker.

See [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) for the full
go-live gap list and [docs/adr/0001-sso-architecture.md](docs/adr/0001-sso-architecture.md)
for the SSO design context.

## Quality gates run before this demo

Captured fresh from the actual workspace, not historical claims:

| Gate | Result |
|---|---|
| `npm run lint` | 0 errors, 151 style warnings (legacy, non-blocking) |
| `npm run typecheck` | clean across `client/` and `server/` |
| `npm run test:ci` (client) | **80 / 80 passing** |
| `npm run test:ci` (server) | **536 / 536 passing** |
| `npm run build` | client + server build succeed |

`npm run verify` runs lint + typecheck + tests + build in one shot.

## Troubleshooting

- **"port is already allocated" on `docker compose up`** — another container is
  pinned to `5434` or `6380`. Run `docker compose down` then `docker ps -a` to
  inspect; remove the stale container with `docker rm <name>`.
- **`/api/readiness` is 503** — DB unreachable. Confirm `docker compose ps`
  shows postgres healthy; the server prints `DATABASE UNREACHABLE` to stdout
  with hints when the boot probe fails.
- **Login returns 401 with the demo creds** — the seed has not run, or you set
  `DEMO_PASSWORD` in `.env`. Re-run `npm run db:seed`.
- **Login returns 423 (locked)** — you tripped the demo's own lockout
  (5 failures in 15 min). Wait it out or `docker compose restart redis` (which
  drops the lockout state — only do this in dev).
- **Server warns about missing env vars at boot** — those are the optional
  surfaces (Anthropic, Stripe, SMTP, Sentry). The demo runs without them; the
  warning is informational in dev.
