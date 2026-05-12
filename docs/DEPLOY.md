# Deploying HERM platform — Vercel + Railway + Neon

A walkthrough for the standard demo / UAT split-deploy. You'll do this
once on Monday morning before colleagues start testing.

**Three accounts, total ~£25/month combined**:
- **Vercel Pro** (£20) — hosts the React SPA, custom domain, commercial use
- **Railway** ($5) — runs the Express API + Redis plugin
- **Neon** (free) — Postgres, free tier covers UAT comfortably

The demo data is small (~50 MB) so all three free / low-tier plans have
plenty of headroom. Production billing scale-up belongs in a separate doc.

## What you need before you start

Have these to hand:
- Access to your Vercel, Railway, Neon dashboards (web UIs are fine — no
  CLI required)
- The repo merged to `master` with this PR included so `vercel.json`,
  `railway.json`, and `client/.env.production.example` exist

Generate two secrets locally (run each once — these never appear in the
repo):

```bash
# JWT signing key — anything ≥ 32 chars, 64 recommended
openssl rand -base64 64

# SSO at-rest envelope-encryption key — exactly 32 bytes hex
openssl rand -hex 32
```

Save both somewhere you can paste from. The first becomes `JWT_SECRET`,
the second `SSO_SECRET_KEY`.

## Step 1 — Neon (Postgres)

1. https://console.neon.tech/ → your existing org → **New Project**.
2. Region: `eu-west-2` (London) if your colleagues are UK-based; lower
   round-trip beats the Vercel/Railway region picks.
3. Postgres version: 16.
4. After create, copy the **Pooled connection string** (NOT direct).
   Append `?sslmode=require&connection_limit=1` if not already present.
   Save it as `DATABASE_URL` for the next step.

## Step 2 — Railway (API + Redis)

1. https://railway.com/ → **New Project** → **Deploy from GitHub repo** →
   pick `rjk134/herm-platform` → branch `master`.
2. **Don't let the first build run yet.** Pause / cancel it if it kicks
   off automatically. With `NODE_ENV=production` and `FRONTEND_URL` /
   `SP_BASE_URL` unset, the container *crashes on boot* (not just fails
   healthcheck — `checkEnvironment()` in `server/src/utils/env-check.ts`
   refuses to start). Railway will mark the deploy "Failed" and burn a
   restart-policy retry. Set the env vars first, *then* deploy.
3. **Add Redis plugin**: Project → New → Database → Redis. Railway
   auto-injects `REDIS_URL` into the API service's environment.
4. **Set env vars** on the API service (Variables tab). The minimum
   set for a working demo:

   | Var | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | (Neon pooled string from Step 1) |
   | `JWT_SECRET` | (the `openssl rand -base64 64` you generated) |
   | `SSO_SECRET_KEY` | (the `openssl rand -hex 32` you generated) |
   | `FRONTEND_URL` | **Set this to the same value as `SP_BASE_URL` for now** — overwrite with the real Vercel URL after Step 3 |
   | `SP_BASE_URL` | (the Railway service's public URL — Settings → Networking → Public Networking) |
   | `DEV_UNLOCK_ALL_TIERS` | `true` (for UAT only — every user sees Enterprise features) |
   | `DEMO_PASSWORD` | leave UNSET for the demo (login page hint is hard-coded to `demo12345`) |

   Why same as `SP_BASE_URL` and not e.g. `https://example.com`: the
   SSO controllers redirect to `${FRONTEND_URL}/login/sso?token=...`
   carrying the session JWT in the query string. If you set a
   third-party origin as the placeholder and someone exercises SSO
   before Step 3 swaps in the Vercel host, the JWT leaks to that
   third party (and may be indexed by their analytics or cached by
   their CDN). Pointing `FRONTEND_URL` at the Railway origin keeps
   the redirect on the same host you control — the 404 is harmless,
   and the JWT only ends up in your own Railway access logs (the
   `httpLogger` middleware logs `req.url` including the query string,
   so it's not "no leak" — it's "leak to a host you already trust
   with everything else").
   **Strong recommendation: don't exercise SSO at all until
   `FRONTEND_URL` is the real Vercel origin.** The placeholder is
   for getting the container to boot the healthcheck — nothing more.
   `/api/health` + `/api/readiness` answer from `curl` even with a
   placeholder, which is enough to hand a working API URL to Vercel
   in the next step.

   `REDIS_URL` is auto-injected by the Redis plugin; don't set it
   manually.

   Optional but nice for the demo:
   | Var | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | (your key) — enables the AI Assistant scenario |
   | `RETENTION_SCHEDULER_ENABLED` | `false` for UAT — keeps soft-deletes around for the testing window |

5. Trigger the first deploy. Healthcheck (`GET /api/health`) should pass.

## Step 3 — Vercel (SPA)

1. https://vercel.com/ → **Add New Project** → import `rjk134/herm-platform`.
2. Vercel reads `vercel.json` automatically; the build command, output
   dir, and SPA rewrite are pre-configured.
3. **Set env vars** (Settings → Environment Variables, Production scope):

   | Var | Value |
   |---|---|
   | `VITE_API_URL` | (the Railway service's public URL — same as `SP_BASE_URL`) |

4. Deploy.
5. Once it deploys, copy the Vercel production URL (e.g.
   `https://herm-platform.vercel.app`) and set it as `FRONTEND_URL` on
   the **Railway** service. Trigger one more Railway redeploy so the
   API picks up the new origin and CORS lets the SPA through.

## Step 4 — Migrate + seed the database

From your laptop, run the migrations and the seed against Neon:

```bash
# Use the Neon DIRECT connection string for migrations, NOT the pooled one
# (Prisma migrate doesn't play well with PgBouncer pooling).
DATABASE_URL='postgresql://...neon-direct...?sslmode=require' \
  npx prisma migrate deploy --schema=prisma/schema.prisma

# Seed reference data + the four UAT personas. Pooled string is fine here.
DATABASE_URL='postgresql://...neon-pooled...?sslmode=require&connection_limit=1' \
  npm run db:seed
```

Expected output ends with the persona list:

```
UAT personas seeded:
  priya@midshire.ac.uk           PROCUREMENT_LEAD  Enterprise   (Russell Group HE)     /login
  marcus@newport-met.ac.uk       EVALUATOR         Professional (post-92 HE)           /login
  rachel@wessex-colleges.ac.uk   PROCUREMENT_LEAD  Enterprise   (FE college group)     /login
  daniel@apex-software.com       admin (vendor)    PREMIUM      (Apex Software)        /vendor-portal
  Password for all four: same as the demo user (DEMO_PASSWORD env or default).
  Note: Daniel logs in via the vendor portal (/vendor-portal renders the vendor sign-in form).
        The buyer /login page will not authenticate him.
```

## Step 5 — Smoke-test before sharing

```bash
# Liveness — Railway
curl -i https://your-railway-host/api/health
# 200, body { "status": "ok" }

# Readiness — Railway (DB + Redis)
curl -i https://your-railway-host/api/readiness
# 200, body lists each dep as "ok"

# SPA — Vercel
curl -I https://your-vercel-host
# 200, content-type: text/html

# Login round-trip
curl -s -X POST https://your-railway-host/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"priya@midshire.ac.uk","password":"demo12345"}' | head
# Expected: { "success": true, "data": { "token": "...", "user": {...} } }
```

If any step is non-200 / 5xx, check:
- Railway → Deployments → Logs for the failing service
- Vercel → Deployments → Logs (build + runtime)
- Neon → Operations log for migration / connection issues

## UAT credentials to share

Send your colleagues this short brief alongside the URL:

```
Site: https://your-vercel-host
Read: docs/USER_TESTING_BRIEF.md (in the repo) for your persona's scenarios.
Pick the persona that matches your real-world role:

  Priya  — Russell Group HE procurement lead
           priya@midshire.ac.uk         / demo12345
  Marcus — post-92 HE SIS administrator
           marcus@newport-met.ac.uk     / demo12345
  Rachel — FE college procurement officer
           rachel@wessex-colleges.ac.uk / demo12345
  Daniel — vendor solutions architect (uses the VENDOR PORTAL, not the
           main login page)
           Sign in at <site>/vendor-portal
           daniel@apex-software.com     / demo12345

Use the persona's lens — only test surfaces they would realistically use
in their day job. File feedback per the template at the bottom of the
brief.
```

> **Why Daniel's login URL is different**: vendor authentication is a
> separate identity surface (`VendorUser` / `VendorAccount` tables in
> `prisma/schema.prisma`). The buyer-side `/login` page queries the
> `User` table and will return `Invalid email or password` for Daniel.
> Hand him the vendor-portal URL up-front so he doesn't waste a UAT
> session debugging it.

## After the UAT — tear-down or persist

- **Persist** for the next round: just stop talking to it. Railway
  bills per usage; idle cost is small. Neon autosuspends after 5 min idle.
- **Tear down**:
  - Vercel: Settings → Delete Project
  - Railway: Project → Settings → Delete Project (Postgres + Redis +
    API gone in one)
  - Neon: free tier, leave it or delete the project from the org

## Cost guard-rails

Each platform has spend alerts. Enable now while costs are still low:
- Railway: Settings → Usage → set a soft cap at $10
- Vercel: Settings → Usage → enable spend cap
- Neon: free tier has a hard cap; nothing to set

## Production-readiness gaps for after the UAT

The settings above are tuned for "demo with friends", not for paying
customers. Before you let real money near this, change at minimum:

- `DEV_UNLOCK_ALL_TIERS=false` — re-engages the Enterprise/Professional
  paywall.
- Configure `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` for billing.
- `RETENTION_SCHEDULER_ENABLED=true` — turns the GDPR / retention
  sweeper on.
- Configure `SP_SIGNING_KEY` + `SP_SIGNING_CERT` if any tenant uses
  UKAMF SAML.
- Move `DATABASE_URL` to a paid Neon plan with point-in-time recovery,
  and enable Neon read replicas if traffic grows.

See `docs/PRODUCTION_READINESS.md` for the full list.
