# Runbook

Day-two operations for Future Horizons ASPT. Commands assume the repo root and a
configured `.env` (see `.env.example`).

## Start / stop

### Local dev
```bash
docker-compose up -d           # Postgres + Redis
npm run dev                    # concurrent client (5173) + server (3002)
```

### Local production-like
```bash
npm run build
node server/dist/index.js      # server only; serve client dist/ via any static host
```

### Graceful shutdown
SIGTERM/SIGINT → close HTTP listener → `prisma.$disconnect()` → exit 0.
Force-exit at 10 s if shutdown stalls. Kubernetes / PM2 / systemd can send
SIGTERM directly.

## Database

### Apply schema (non-destructive)
```bash
npm run db:push
```

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
Set `DATABASE_URL` to the production connection string; never run
`db:push --force-reset`. For schema migrations in prod, use
`prisma migrate deploy` (add this script when you introduce migrations;
currently the project uses `db:push`).

## Health checks

```bash
curl -i http://localhost:3002/api/health      # liveness
curl -i http://localhost:3002/api/readiness   # db ping
```

Expect 200 for both. `readiness` flips to 503 on DB loss.

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
# 2. Apply the current schema:
npm run db:push
# 3. If needed, re-seed reference data (non-tenant):
npm run db:seed
```

Tenant data (users, baskets, projects) comes from the backup restore, not
the seed.

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
