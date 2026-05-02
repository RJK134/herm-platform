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
2. Railway will detect the `Dockerfile` and `railway.json` and start a
   build. Let it run — it will fail healthcheck the first time because
   env vars aren't set yet. That's expected.
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
   | `FRONTEND_URL` | (paste this AFTER Vercel deploy in Step 3) |
   | `SP_BASE_URL` | (the Railway service's public URL — Settings → Networking → Public Networking) |
   | `DEV_UNLOCK_ALL_TIERS` | `true` (for UAT only — every user sees Enterprise features) |
   | `DEMO_PASSWORD` | leave UNSET for the demo (login page hint is hard-coded to `demo12345`) |

   `REDIS_URL` is auto-injected by the Redis plugin; don't set it
   manually.

   Optional but nice for the demo:
   | Var | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | (your key) — enables the AI Assistant scenario |
   | `RETENTION_SCHEDULER_ENABLED` | `false` for UAT — keeps soft-deletes around for the testing window |

5. Trigger a redeploy. Healthcheck (`GET /api/health`) should pass.

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
  priya@midshire.ac.uk           PROCUREMENT_LEAD  Enterprise   (Russell Group HE)
  marcus@newport-met.ac.uk       EVALUATOR         Professional (post-92 HE)
  rachel@wessex-colleges.ac.uk   PROCUREMENT_LEAD  Enterprise   (FE college group)
  daniel@apex-software.com       VENDOR_ADMIN      —            (Vendor portal)
  Password for all four: same as the demo user (DEMO_PASSWORD env or default)
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
  Daniel — vendor solutions architect
           daniel@apex-software.com     / demo12345

Use the persona's lens — only test surfaces they would realistically use
in their day job. File feedback per the template at the bottom of the
brief.
```

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
