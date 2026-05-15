# Stripe go-live runbook

**Status:** the FHE Procurement Platform's Stripe integration is **fully built and tested in TEST mode**. This runbook captures the steps to flip the production deploy to live mode (real customer payments).

> ⚠️ **Do NOT run these steps overnight.** Mis-configured live envs can result in customers being charged but `Subscription` rows not updating. Run the cutover during business hours with the dunning + readiness dashboards open.

---

## Prerequisites

Before you start the cutover, confirm you have:

- [ ] Live Stripe account access (`https://dashboard.stripe.com` with the **Viewing test data** toggle **off**).
- [ ] Vercel project admin (`https://vercel.com/rjk134s-projects/herm-platform-client` → **Settings** → **Environment Variables**).
- [ ] A real card you control (or a small Stripe Issuing virtual card) for the post-cutover smoke test.
- [ ] PR #146 ([Phase 16.11 — env-validate Stripe price IDs at boot](https://github.com/RJK134/herm-platform/pull/146)) merged to master. Without it the new envs aren't enforced and a typo silently rolls back to "Price not configured" on first checkout.
- [ ] PR #144 ([Phase 16.9 — `invoice.payment_succeeded` handler](https://github.com/RJK134/herm-platform/pull/144)) merged. Without it past_due subscriptions never auto-recover from a successful retry.
- [ ] PR #145 ([Phase 16.10 — Customer Portal session endpoint](https://github.com/RJK134/herm-platform/pull/145)) merged. Without it the "Manage on Stripe" button is broken (legacy env was dropped).

If any of those PRs are still open, **finish merging them before starting the cutover**.

---

## Step 1 — Provision live products in Stripe Dashboard

> This step has been **deferred from the overnight run** per the locked decision (provision live products needs your eyes — deletes are restricted in live mode).

In `https://dashboard.stripe.com/products` (live mode), create the four products + their prices:

| Product name | Tier | Monthly price | Annual price (optional) |
|---|---|---|---|
| FHE Procurement Platform — Pro | `pro` | **£199.00 GBP** / month, recurring | £2,500.00 GBP / year |
| FHE Procurement Platform — Enterprise | `enterprise` | **£499.00 GBP** / month, recurring | £8,000.00 GBP / year |
| FHE Procurement Platform — Vendor Enhanced | (vendor) | TBD by you | — |
| FHE Procurement Platform — Vendor Premium | (vendor) | TBD by you | — |

For each product:
1. Set **Statement descriptor** to something a customer will recognise on their card statement (e.g. `FHE PROCUREMENT`).
2. Use **GBP** as the price currency (the codebase formats invoices via `Intl.NumberFormat('en-GB')`).
3. After creation, **copy the price ID** (begins with `price_…`) — you'll paste it into Vercel envs in Step 2.

> **Note:** the codebase currently routes monthly only. Annual price IDs can be created and stashed in the Dashboard for later — the code path that consumes them ships in a Phase 17 follow-up.

---

## Step 2 — Configure Vercel envs (production scope only)

In Vercel → Project **Settings** → **Environment Variables** → **Production**, set / update:

| Env | Value | Source |
|---|---|---|
| `STRIPE_SECRET_KEY` | your live `sk_live_…` | Stripe Dashboard → Developers → API keys → Restricted keys → create with `subscription:write`, `customer:write`, `invoice:read`, `billing_portal:write` permissions. **Do NOT use the unrestricted secret key.** |
| `STRIPE_WEBHOOK_SECRET` | the live webhook secret | Set after Step 3 below — Stripe generates it when you create the endpoint |
| `STRIPE_PRICE_INST_PRO` | the `price_…` from Step 1 (Pro monthly) | Stripe Dashboard → Products → Pro → Pricing |
| `STRIPE_PRICE_INST_ENT` | the `price_…` from Step 1 (Enterprise monthly) | Stripe Dashboard → Products → Enterprise → Pricing |
| `STRIPE_PRICE_VENDOR_ENH` | (optional, vendor) | Stripe Dashboard, when ready |
| `STRIPE_PRICE_VENDOR_PREM` | (optional, vendor) | Stripe Dashboard, when ready |
| `STRIPE_PRICE_INST_PRO_LEGACY` | (optional) | Only set if you need to map an *older* Pro price ID to the same `PRO` tier in webhooks. Skip unless you have a specific legacy price you're rotating out of. |

**Crucially**: select both **Production** and **Build** scope checkboxes for `STRIPE_SECRET_KEY` + `STRIPE_PRICE_INST_PRO` + `STRIPE_PRICE_INST_ENT`. If they're runtime-only, the Vercel build's `prisma migrate deploy` step has access but the `checkEnvironment()` boot check (Phase 16.11) doesn't see them and throws.

---

## Step 3 — Configure Stripe webhook endpoint

In `https://dashboard.stripe.com/webhooks` (live mode):

1. Click **+ Add endpoint**.
2. **Endpoint URL**: `https://herm-platform.vercel.app/api/subscriptions/webhook`
3. **Description**: `FHE Procurement Platform live`
4. **Events to send** (exactly these 7):
    - `checkout.session.completed`
    - `customer.subscription.deleted`
    - `customer.subscription.updated`
    - `invoice.payment_failed`
    - `invoice.payment_succeeded` — **requires PR #144 (Phase 16.9) to be merged**, otherwise this event is delivered but the handler is missing and Stripe will silently retry. The Prerequisites checklist above pins this.
    - `charge.refunded`
    - `charge.dispute.created`

    If PR #144 is not yet merged when you reach this step, **stop and merge it first**. Enabling the event on a webhook endpoint whose server doesn't handle it isn't dangerous (the request 200s on the unknown-event no-op path) but past_due subscriptions won't auto-recover until #144 lands.
5. After creation, **click your new endpoint** → **Signing secret** → **Reveal** → copy the `whsec_…` value.
6. Paste this into Vercel as `STRIPE_WEBHOOK_SECRET` (production scope, both Production + Build).

---

## Step 4 — Trigger production redeploy

Either push a no-op commit to master (e.g. `chore: trigger redeploy for stripe live cutover`) OR in Vercel click the latest production deployment → **... menu** → **Redeploy**.

The build will:
1. Run `prisma generate`.
2. Run `prisma migrate deploy` (no-op if no pending migrations).
3. **Run `checkEnvironment()`** which now requires `STRIPE_PRICE_INST_PRO` + `STRIPE_PRICE_INST_ENT` in production. **If you missed an env, the build fails here with a clear error.** That's the design — fail-loud.
4. Build server tsc + client vite.

---

## Step 5 — Smoke test

Open the live site (`https://herm-platform.vercel.app`) in a real browser session.

1. **Health checks**:
    ```bash
    curl -s https://herm-platform.vercel.app/api/health        # → 200, {"status":"ok"}
    curl -s https://herm-platform.vercel.app/api/ready         # → 200, database.ok: true
    ```
2. **Free→Pro upgrade with a real card**:
    - Sign in as a Free-tier user (create a test institution if needed).
    - Go to **/subscription** → click **Upgrade to Pro — £199/mo**.
    - Stripe Checkout opens against your live account.
    - Pay with the small-amount card you have for this purpose.
    - After redirect back to the site, verify:
      - Vercel logs show the `checkout.session.completed` webhook firing + DB-write + admin notification email sent.
      - DB row: `Subscription.tier = 'PRO', status = 'active', stripeCustomerId` populated.
      - The `<TierBadge />` in the sidebar reads "Pro" in teal.
3. **Customer portal session** (Phase 16.10):
    - Click **Manage on Stripe** on the Subscriptions page.
    - You should redirect to `billing.stripe.com/...`.
    - Click **← Return to FHE Procurement Platform** in the portal — should land back on `/subscription`.
4. **Refund** (clean up the test payment):
    - In Stripe Dashboard (live mode) → Payments → find your test charge → **Refund**.
    - Vercel logs show the `charge.refunded` webhook → DB row `Payment.status = 'refunded'`.

If steps 2–4 all pass, **you're live**. Remove the `DEV_UNLOCK_ALL_TIERS=true` env if it was set in production (env-check.ts already loud-warns about this).

---

## Rollback

If anything in steps 5.2–5.4 misbehaves:

1. **Don't retire the test keys yet.**
2. In Vercel → Production envs, swap `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` back to the test values.
3. In Stripe Dashboard (live mode) → Webhooks → **disable** (don't delete) the live webhook endpoint so it doesn't keep retrying against the now-test-mode app.
4. Trigger a Vercel redeploy.
5. Manually refund any real charges that were taken.
6. Reach out — I can help diagnose from the Vercel function logs.

---

## What's NOT in this runbook (deferred)

- **Vendor self-serve checkout** — service signature accepts `vendorAccountId` but no client surface exposes it (vendor JWT auth is a separate middleware system; punted to Phase 17).
- **Annual price tier** — codebase routes monthly only; annual prices can be created in Step 1 and the code that uses them lands in Phase 17.
- **Manual retry endpoint** — currently customers update their card via the portal and Stripe retries on its own schedule. An admin "trigger retry now" endpoint is a nice-to-have, not built yet.
- **Live products provisioned via the Stripe MCP** — Phase 16.12 originally bundled this. Skipped overnight per locked decision: live-mode products are difficult to delete after creation, so this needs your supervised provisioning hands-on.

---

_This runbook supersedes the brief Stripe section in `RUNBOOK.md`. Any future env-var additions should be reflected here as well as in `RUNBOOK.md § Env-var matrix`._
