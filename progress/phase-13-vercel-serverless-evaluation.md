# Phase 13 — Vercel-only serverless deploy (evaluation)

**Status:** parked. Captured 2026-05-06 (after a parallel-session
prompt suggested a same-day refactor; rejected because it would have
broken the in-flight UAT delivery and is a multi-week change in
disguise).

**Decision before doing any of this:** does the team actually want
single-vendor (Vercel) billing badly enough to justify the work, or
is the current Railway + Neon + Vercel-SPA topology fine? If the
answer is "the current topology is fine", close this doc and never
do Phase 13.

## Why we paused

Late Sunday a "deploy to Vercel as a single project" prompt was
proposed mid-UAT. It would have replaced Railway and Neon with
Vercel functions and Vercel Postgres in one go, on the same evening
the UAT was being stood up. The pivot was rejected for three reasons:

1. **Throws away in-flight work** — the Railway service had just
   been provisioned, env vars half-set; the Neon project was being
   created. A pivot would have invalidated all of that.
2. **Architectural mismatch** — HERM platform has long-running
   schedulers (retention sweeper, UKAMF cert rotation) and stateful
   in-memory caches (lockout, OIDC PKCE, SAML SLO replay, JWT JTI)
   that don't fit a vanilla serverless model.
3. **PR #93 was open at the time** with the prisma migration drift
   fix; refactor branch off old master would have conflicted.

None of those reasons say "Vercel-only is wrong forever". They say
"Vercel-only is wrong as a same-day pivot during a UAT". The
evaluation below is what it would actually take to do this properly.

## Audit (must complete before committing to Phase 13)

### Route inventory

Every route in `server/src/api/` needs a verdict in one of three
buckets. The verdict drives whether the route migrates as-is, needs
the Vercel Pro 60-second timeout, or has to stay on long-lived
infrastructure.

| Bucket | Constraint | Examples (non-exhaustive — needs full sweep) |
|---|---|---|
| Serverless-safe | idempotent, <10 s, no in-memory state | `/api/auth/*`, `/api/sso/*`, `/scim/v2/*`, `/api/capabilities/*`, `/api/scores/*`, `/api/health` |
| Needs Pro (10–60 s) | timeout > Hobby cap | `/api/chat/*` (AI assistant — Anthropic call), `/api/export/*` (bulk export), heavy `/api/scoring/*` aggregations |
| Cannot serverless | streaming, long-running, or stateful between calls | `/api/metrics` (Prometheus counters reset on cold start), any future websocket / SSE surfaces |

The actual sweep should look at `server/src/api/*/router.ts` and
classify each handler. ~15 minutes for someone who knows the codebase.

### Long-running jobs

Currently in `server/src/jobs/`:

- **Retention scheduler** — daily soft-delete cleanup. GDPR-relevant.
  Must run reliably (i.e. >99% on-time). Vercel Cron candidate, but
  needs an SLA conversation.
- **UKAMF metadata-feed cert auto-rotation** — periodic poller for
  SAML cert refresh from the UKAMF feed.

Both become Vercel Cron invocations. Vercel Cron requires Pro plan
(already paid for) but caps at one execution per minute and has its
own reliability characteristics that need verification before relying
on for the GDPR-relevant retention sweep.

### Stateful in-memory caches

CLAUDE.md cites these explicitly: "In-memory `Map` + Redis fallback
for short-lived state (lockout counters, OIDC PKCE flow, SAML SLO
replay, session JTI store)". In serverless every invocation is cold
and stateless; the `Map` leg loses data between calls. Migration:
force every cache to Redis-only, drop the `Map` fallback. Needs:

- **Upstash Redis** (or other Vercel-friendly Redis) — Vercel has no
  managed Redis. Upstash free tier is ~10 k commands/day; paid from
  ~$0.20/100k commands. HERM platform's traffic at UAT scale is
  comfortably inside the free tier; production traffic likely needs
  the paid tier.
- A grep through `server/src/lib/` for any `new Map()` that backs an
  auth-relevant cache, and a follow-up PR per cache to drop the
  fallback.

### Database

Two viable choices:

1. **Stay on Neon** — Vercel functions talk to Neon over the public
   pooled connection string. Zero data migration. Two-vendor billing.
2. **Migrate to Vercel Postgres** — one-vendor billing. Data-copy +
   DSN swap. Vercel Postgres is Neon under the hood (Vercel resells
   Neon), so technical risk is low.

**Recommendation: stay on Neon unless single-vendor billing is a
hard requirement.** Vercel Postgres pricing tracks Neon's; the only
material gain is the consolidated invoice.

### Cold start + p95 latency

Prisma + Express wrapper has a non-trivial cold-start cost. Budget:

- Cold start (first hit): 2–3 s (Prisma client init + bundle parse)
- Warm: <100 ms typical

CLAUDE.md cites a proposed p95 SLO of "500 ms read / 1500 ms AI
chat". Cold-start hits will breach the read SLO. Mitigations:

- Pre-warming with a `/api/health` ping every minute via Vercel Cron
- Vercel Pro's "Edge Runtime" for non-Prisma routes (smaller bundle,
  faster cold start) — but that's most of the surface, so the win
  is marginal
- Accept the breach and amend the SLO doc to say "warm only"

### Observability

- `/api/metrics` (Prometheus) is broken in serverless — counters
  reset on every cold start. Replace with: push every metric event
  to a sink (e.g. a logging line that an external collector
  aggregates), or switch to Vercel Analytics for the request-counter
  half. The auth-event counters (login success / fail / SSO events)
  need a real per-tenant aggregator either way.
- `httpLogger`, `requestId`, structured pino logs — keep working.
  Vercel collects stdout into the dashboard.

## Cost

| Component | Current | Phase 13 | Delta |
|---|---|---|---|
| Vercel | £20/mo Pro | £20/mo Pro | £0 |
| Railway | $5/mo | $0 (decom) | -$5/mo |
| Neon | £0 (free) | £0 (stay) or migrate to Vercel Postgres at parity pricing | £0 |
| Upstash Redis | n/a | £0 (UAT) — ~$5–10/mo at production scale | +$0–10/mo |
| Vercel Cron | included Pro | included Pro | £0 |
| **Total** | ~£25/mo | ~£15–25/mo | -£10 to ±£0 |

Phase 13 is roughly cost-neutral. The case for it is operational
simplicity (one vendor's dashboard, one billing relationship), not
cost.

## Cutover plan (high level)

1. **Audit complete** — every route classified, every job mapped to
   Vercel Cron, every in-memory cache migrated to Redis-only.
2. **Branch + serverless wrapper** — `feat/p13-vercel-serverless`.
   Add `api/[...slug].ts` Vercel catch-all, extract `createApp()` in
   `server/src/app.ts`. Tested in Vercel preview deployments.
3. **Provision Upstash Redis** — point branch's `REDIS_URL` at it.
4. **Verify against audit** — every route in the "serverless-safe"
   bucket actually works in preview; "needs Pro" routes verified
   against 60 s timeout; "cannot serverless" routes either
   redesigned or kept on a parallel non-Vercel surface.
5. **UAT against Vercel preview** — parallel to Railway. Same UAT
   personas, same test brief, same browser flows. Diff the results.
6. **Cutover** — Vercel-side `VITE_API_URL` swung to the new
   serverless API host. Railway service kept warm for 1 week as
   rollback target.
7. **Decom Railway** — cancel the service, archive the
   `railway.json` config.

## Success criteria for "Phase 13 complete"

- All Phase 11 + Phase 12 features work in serverless deployment
- p95 latency within 1.5× of current Railway baseline (after warm)
- Cold starts <3 s on non-AI routes
- Retention scheduler + UKAMF cert rotation fire reliably (>99 %
  on-time over 30 days)
- No regression in audit coverage (every login, every SSO event,
  every admin action still produces an audit row)
- Cost increase ≤£10/mo vs current

## Open questions for the product owner

- Is single-vendor billing actually a stated requirement, or a "would
  be nice"? If the latter, Phase 13 may never be worth doing.
- Is Vercel Cron's reliability acceptable for the retention scheduler
  given the GDPR consequence of a missed sweep?
- Is the cold-start impact on `/api/health` (Railway healthcheck
  equivalent) acceptable, or do we need pre-warming?
- Does "p95 within 1.5× of Railway baseline" account for the AI
  chat surface, or do we negotiate a separate AI SLO?

## Reference: artefacts from the rejected pivot

The parallel-session prompt referenced files like
`/refactor-bundle/api/[...slug].ts`, `prisma-patches/...`, etc., that
don't exist in the repo. If anyone resurrects this evaluation,
**don't** pull in that bundle without re-deriving it from the audit
above — the bundle was authored without context of HERM's actual
schedulers / caches / observability surface.
