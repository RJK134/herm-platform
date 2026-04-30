# Runbook

Day-two operations for Future Horizons ASPT. Commands assume the repo root and a
configured `.env` (see `.env.example`).

## Start / stop

### Local dev
```bash
cp .env.example .env           # ports already aligned to docker-compose
docker compose up -d           # Postgres + Redis
npm run demo:bootstrap         # install + prisma generate/push + full seed
npm run dev                    # concurrent client (5173) + server (3002)
```

Or use the one-shot helpers (Linux/macOS): `./start.sh` / `./stop.sh`.
For the colleague-review walkthrough see [DEMO.md](DEMO.md).

### Local production-like
```bash
npm run build
node server/dist/index.js      # server only; serve client dist/ via any static host
```

### Production container image

```bash
# Build (CI is the canonical builder; this command is for local verification)
docker build -t herm-platform:$(git rev-parse --short HEAD) .

# Run with the prod env-var matrix
docker run --rm -p 3002:3002 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=... \
  -e FRONTEND_URL=https://app.example.com \
  -e SENTRY_DSN=... \
  -e STRIPE_SECRET_KEY=... \
  -e STRIPE_WEBHOOK_SECRET=... \
  herm-platform:<tag>

# Apply migrations from inside the container (prefer this over running
# from CI/CD so secrets stay scoped to the deployment context). The
# `prisma` CLI is installed globally in the runner stage, pinned to
# the same major as @prisma/client, so this works air-gapped without
# an at-runtime npm registry round-trip.
docker run --rm \
  -e DATABASE_URL=postgresql://... \
  herm-platform:<tag> prisma migrate deploy --schema=prisma/schema.prisma
```

The image is multi-stage:
- `node:20-alpine` runtime (~150 MB final image).
- Non-root user `node`.
- Bundles compiled server (`server/dist`), the Prisma client (regenerated
  in the runner stage so the engine binary matches the slim production
  dep tree), `prisma/schema.prisma`, and `prisma/migrations/` for
  `db:migrate:deploy` from inside the container.
- **Excludes** the client SPA (served separately), test files, source
  TypeScript, and seed scripts (seed scripts need `tsx` which is a
  devDependency; run them from a separate one-off container if needed).
- Built-in `HEALTHCHECK` probes `/api/health` every 30 s.

#### Env-var matrix

| Var | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` flips strict env-check + hides internal error details |
| `DATABASE_URL` | yes | Postgres connection string (consider `?connection_limit=10&options=-c statement_timeout=15000`) |
| `JWT_SECRET` | yes | ≥ 32 chars; 64+ recommended |
| `FRONTEND_URL` | yes (prod) | Browser-facing origin used for CORS **and** the post-SSO redirect (which carries the session JWT). `checkEnvironment()` refuses to boot in prod without it. |
| `SP_BASE_URL` | yes (prod) | API origin used for SAML ACS + OIDC callback URLs (Phase 10.10). Without it, IdPs would be told to redirect to localhost. `checkEnvironment()` refuses to boot in prod without it. |
| `SP_ENTITY_ID` | optional | SAML entity ID. Defaults to `<SP_BASE_URL>/api/sso/sp`; override only when an IdP admin (e.g. UKAMF) assigns one. |
| `SP_SIGNING_KEY` | optional (req'd for UKAMF) | PEM private key used to sign SAML AuthnRequests + SP metadata. Pair with `SP_SIGNING_CERT` — both set or both unset. Inline PEM (literal `\n` allowed) or `file:/abs/path.pem`. Generate a self-signed pair with `openssl req -x509 -newkey rsa:2048 -nodes -days 730 -keyout sp-signing.key -out sp-signing.crt -subj /CN=herm-sp`. |
| `SP_SIGNING_CERT` | optional (req'd for UKAMF) | PEM X.509 certificate matching `SP_SIGNING_KEY`. Same accepted forms. |
| `REDIS_URL` | optional | Enables shared lockout state + the SSO OIDC PKCE flow store + Redis readiness probe. Without it, lockout falls back to in-memory (per-pod). Required for multi-pod deployments. |
| `SENTRY_DSN` | optional | Error reporting; no-op when unset |
| `SENTRY_ENVIRONMENT` | optional | Defaults to `NODE_ENV` |
| `SENTRY_TRACES_SAMPLE_RATE` | optional | 0–1; default 0 (errors only) |
| `STRIPE_SECRET_KEY` | optional | If set, **`STRIPE_WEBHOOK_SECRET` must also be set** (env-check is fatal otherwise) |
| `STRIPE_WEBHOOK_SECRET` | optional | Required when `STRIPE_SECRET_KEY` is set |
| `ANTHROPIC_API_KEY` | optional | AI assistant |
| `SMTP_HOST` | optional | SMTP relay host. When set, `SMTP_FROM` (or `SMTP_USER`) must also be set or env-check fails — outbound email would otherwise silently no-op. |
| `SMTP_PORT` | optional | 1–65535; STARTTLS on 587 by default |
| `SMTP_SECURE` | optional | `"true"` for SMTPS (port 465); leave unset for STARTTLS |
| `SMTP_USER` / `SMTP_PASSWORD` | optional | Relay credentials |
| `SMTP_FROM` | optional (req'd with `SMTP_HOST`) | RFC-5322 mailbox, e.g. `"HERM <noreply@example.com>"` |
| `RATE_LIMIT_*` | optional | Per-tier ceilings (`ANONYMOUS`, `FREE`, `PROFESSIONAL`, `ENTERPRISE`, `API_KEY`); see `middleware/security.ts` for defaults |
| `DEV_UNLOCK_ALL_TIERS` | optional | Pre-billing escape hatch — every logged-in user gets `tier="enterprise"`. Env-check shouts loudly if set in prod. Useful for demos before subscriptions land. |
| `DEMO_PASSWORD` | optional | Overrides the seed-default demo user password (`demo12345`). Leave unset for documented demos — the Login page demo-credentials hint is hard-coded to the default. |

### Graceful shutdown
SIGTERM/SIGINT → close HTTP listener → flush Sentry → `prisma.$disconnect()` → exit 0.
Force-exit at 10 s if shutdown stalls. Kubernetes / PM2 / systemd can send
SIGTERM directly. The Dockerfile uses exec-form `CMD ["node", ...]` so
SIGTERM reaches Node directly without a wrapping shell process.

## Database

### Apply schema (dev / test only — non-destructive but no migration history)
```bash
npm run db:push
```

`db:push` is the fast path used by local dev and the CI test job. It reconciles
the live DB to match `prisma/schema.prisma` by running diffed DDL directly,
**without** creating a migration record. Never use it against prod.

### Apply migrations (prod / staging)
```bash
npm run db:migrate:deploy   # applies every migration in prisma/migrations/ in order
npm run db:migrate:status   # show which migrations have been applied
```

This is the only supported path to change a prod schema. Workflow:

> **First-time baseline (one-off, only for DBs bootstrapped via `db:push`)**
>
> Any DB that was created or kept in sync via `db:push` already has the
> current schema shape but no rows in `_prisma_migrations`. Running
> `migrate deploy` against it would try to re-create tables that already
> exist and fail. For those DBs, run the baseline once:
>
> ```bash
> for m in $(ls prisma/migrations | grep -v migration_lock); do
>   npx prisma migrate resolve --applied "$m" --schema=prisma/schema.prisma
> done
> npm run db:migrate:status   # confirm "Database schema is up to date"
> ```
>
> After this, future deploys use `db:migrate:deploy` normally. Fresh
> Postgres instances (CI, new prod) skip the baseline — `migrate deploy`
> applies every migration from scratch.

1. Locally: edit `prisma/schema.prisma` then run
   `npx prisma migrate dev --name <short_change_name>` — creates a new
   timestamped folder under `prisma/migrations/` with the SQL Prisma
   computed and applies it to your dev DB.
2. Commit the new migration folder alongside the schema change. CI's
   `Validate Prisma schema` job will fail the PR if the schema file
   drifted from the migrations.
3. On deploy: pipeline runs `npm run db:migrate:deploy` against prod
   before the new app version starts taking traffic. Migrations are
   forward-only; rollback uses a DB snapshot, not a reverse migration
   (see "Rolling back a deploy" below).

### Generate the Prisma client (after schema changes)
```bash
npm run db:generate
```

### Seed reference data
```bash
npm run db:seed                # full seed (HERM + vendors + demo)
npm run db:seed:demo           # demo user only
npm run db:seed:jurisdictions  # procurement jurisdictions only
```

### Studio (visual browser)
```bash
npm run db:studio
```

### Connecting to prod
Set `DATABASE_URL` to the production connection string; **never run
`db:push --force-reset` against prod**. For schema changes use the
migration workflow described in "Apply migrations (prod / staging)"
above — `db:push` is only for dev / CI test DBs that get torn down.

## Health checks

```bash
curl -i http://localhost:3002/api/health      # liveness
curl -i http://localhost:3002/api/readiness   # db ping (also at /api/ready)
npm run demo:validate                         # all of the above + demo login
```

Expect 200 for both. `readiness` flips to 503 on DB (or, when `REDIS_URL` is
set, Redis) loss.

## Logs

All production logs are JSON lines. Every line carries `req.id` so you can
correlate a single request across the HTTP log, business logic logs, and the
error handler.

```bash
# Find all logs for one request
jq 'select(.req.id == "REQ-ID")' server.log

# Failed logins in the last hour
jq 'select(.msg=="login failed" and (.time | fromdateiso8601) > (now-3600))' server.log

# AI cost audit: sum output tokens per user
jq -r 'select(.msg=="ai.chat completed") | "\(.userId)\t\(.outputTokens)"' server.log \
  | awk '{ users[$1] += $2 } END { for (u in users) print u, users[u] }'
```

### Common error patterns

| Log message                 | Meaning                                          | Fix                                          |
|-----------------------------|--------------------------------------------------|----------------------------------------------|
| `readiness: database ...`   | Postgres unreachable                             | Check DB host/creds; verify `DATABASE_URL`   |
| `ai.chat failed`            | Anthropic API error / timeout                    | Inspect `err.status`, retry, check quota     |
| `unhandled error`           | Uncaught exception reached errorHandler          | Triage via `err.stack` + `req.id`            |
| `AUTHENTICATION_ERROR`      | 401 from `authenticateJWT`                       | Token missing/expired/invalid                |
| `RATE_LIMIT_EXCEEDED`       | Caller hit `express-rate-limit`                  | Back off; raise limit if false-positive      |

## Secrets

### Rotate `JWT_SECRET`
1. Generate a new value (`openssl rand -base64 48`).
2. Update the secret in your secret store.
3. Roll the deployment. **All existing tokens are invalidated** — clients
   will see a 401 and the axios interceptor will redirect them to `/login`.

### Rotate `ANTHROPIC_API_KEY`
1. Create a new key in the Anthropic console.
2. Update the secret.
3. Roll the deployment. No user-visible impact if keys overlap during the
   rollout.

### Rotate Stripe secrets
Same pattern. Webhooks: update the endpoint signing secret in both Stripe
and `STRIPE_WEBHOOK_SECRET` simultaneously.

## Backups and restore

The app itself performs no backups — rely on the managed Postgres provider
(e.g. RDS, Supabase, Neon) automated backups. To restore:

```bash
# 1. Point DATABASE_URL at the restore target.
# 2. Apply migration history (forward-only; matches prod schema state):
npm run db:migrate:deploy
# 3. If needed, re-seed reference data (non-tenant):
npm run db:seed
```

Tenant data (users, baskets, projects) comes from the backup restore, not
the seed. If the snapshot was taken at a schema state OLDER than the
current migration history, restore the snapshot first then run
`db:migrate:deploy` to bring it forward.

## Rolling back a deploy

1. Identify the last known good release SHA / tag.
2. In your deploy platform, roll the service back to that version.
3. Watch `/api/readiness` until 200.
4. Watch error-rate dashboards for 5 minutes.
5. Open an incident note describing the trigger and rollback.

Schema-incompatible rollbacks: if the rolled-back version is incompatible
with the current DB schema, you must first restore the DB to a snapshot
taken before the bad migration. Treat this as an incident.

## Scaling knobs

- **Rate limits** — `server/src/middleware/security.ts` (global) and
  `server/src/api/chat/chat.router.ts` (chat-specific).
- **AI timeout** — `REQUEST_TIMEOUT_MS` in `server/src/services/ai-assistant.ts`.
- **JSON body size** — `express.json({ limit: '1mb' })` in `server/src/app.ts`.
- **Token expiry** — `generateToken` in `server/src/middleware/auth.ts`.
