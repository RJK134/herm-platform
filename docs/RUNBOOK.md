# Runbook

## Start / stop

### Local dev
```bash
docker compose up -d       # Postgres + Redis
npm install
npm run db:generate
npm run db:push            # push schema (dev only — use migrate in prod)
npm run db:seed
npm run dev                # concurrently runs client (5173) + server (3002)
```

Stop: `Ctrl+C` in the `npm run dev` terminal, then `docker compose down`.

### Production (container-shaped)
- Build: `npm ci && npx prisma generate && npm run build`
- Start: `node server/dist/index.js`
- Liveness probe: `GET /api/health`
- Readiness probe: `GET /api/ready`
- Graceful shutdown: SIGTERM → closes HTTP → disconnects Prisma → exits. Force-exit after 10s.

## Database migrations

**Development** (schema drift):
```bash
npm run db:push            # push schema
# or to keep a migration file:
npx prisma migrate dev --name <short_description>
```

**Production**:
```bash
npx prisma migrate deploy
```

**Rolling back** is not directly supported by Prisma. Options:
1. Forward-fix with a new migration that reverses the change.
2. Restore from the latest Postgres backup (see your managed-Postgres provider).

## Seeding

```bash
npm run db:seed                      # full seed
npm run db:seed:demo                 # demo institution + user
npm run db:seed:jurisdictions        # procurement jurisdictions only
```

The seed orchestrator is `prisma/seed.ts`. Large data lives in `prisma/seeds/*` (capabilities, vendor profiles, research items, scoring methodology).

## Logs and correlation

Every response carries `x-request-id`. Every structured log line carries the same id in its `reqId` / `requestId` field. To trace a request:

```
<aggregator>  req.id=abc-123
  → all middleware + route logs for that request
  → any AI calls that happened as part of that request (same requestId)
```

Log levels:
- `info` — successful requests, AI completions
- `warn` — client errors (4xx), readiness failures, Prisma request errors
- `error` — unhandled server errors

## Common incidents

### `/api/ready` returns 503
- Check DB connectivity. Inspect the response body's `checks.database.message`.
- Check whether `DATABASE_URL` is reachable from the pod / container.
- Prisma pool exhaustion: raise `DATABASE_URL?connection_limit=<n>` if you see "Too many connections".

### AI chat is broken
- If users see "The AI Assistant requires an ANTHROPIC_API_KEY…" — the key is unset.
- If users see a 429, Anthropic is rate-limiting. Back off or shard.
- If tokensIn/out are suspiciously high in logs, inspect the caller (a system prompt escape attempt?). `sanitiseUserInput` should strip injection markers.
- If all chat requests fail at 401 — a regression reintroduced anonymous access; check `server/src/api/chat/chat.router.ts` keeps `authenticateJWT`.

### Stripe webhook failing
- Confirm `STRIPE_WEBHOOK_SECRET` matches the deployed endpoint.
- Check that the webhook body is being received as a raw Buffer (subscriptions router uses `express.raw` specifically for the webhook path).
- Replay via the Stripe Dashboard.

### 401s after token renewal
- Clear localStorage `herm_auth_token` in the browser and re-login.
- Check that the response `x-request-id` is present and server logs show `AUTHENTICATION_ERROR` with the same id.

### Deploy rolled back and DB schema is ahead
- Forward-fix: apply a new migration that adapts to the newer schema, or write a data-only migration to re-shape rows.
- Avoid `prisma migrate reset` in production.

## On-call quick commands

```bash
# Tail structured logs (JSON lines)
<your-log-tool> | jq 'select(.reqId == "abc-123")'

# Is the DB responsive?
psql "$DATABASE_URL" -c 'SELECT 1'

# Are migrations applied?
npx prisma migrate status

# Smoke the running server
curl -sS http://HOST/api/health
curl -sS http://HOST/api/ready
```

## Rotating secrets

- **JWT_SECRET** — rotating invalidates all existing tokens (users must re-login). Plan a maintenance window, or support dual-accept during rotation.
- **ANTHROPIC_API_KEY** — no user impact; chat briefly unavailable during deploy.
- **STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET** — rotate the webhook secret in Stripe first, then deploy. Replay missed webhooks from the Stripe dashboard.
- **DATABASE_URL** — credentials only; schema unchanged. Restart pods.
