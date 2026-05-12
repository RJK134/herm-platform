-- Phase 15.2 — rename `SubscriptionTier.PROFESSIONAL` to `PRO`.
--
-- Part of the FH Procure rebrand (Phase 15.1 shipped the product-name
-- swap; this migration aligns the tier nomenclature with the new
-- pricing copy: "Free / Pro / Enterprise"). "Professional" was always
-- a mouthful — "Pro" is the form the UI, Stripe price IDs, and
-- marketing collateral will all use from here on.
--
-- ALTER TYPE ... RENAME VALUE is supported on Postgres 10+ (we're on
-- 16). It updates the enum's catalogue entry in place; existing
-- Subscription rows referencing PROFESSIONAL flip to PRO transparently
-- — no UPDATE on the table required, no rewrite, no rebuild of
-- dependent indexes.
--
-- The defensive UPDATE below is a no-op once the RENAME VALUE has run
-- (any row that used to read 'PROFESSIONAL' now reads 'PRO'), but it
-- keeps the migration idempotent if a future re-application catches a
-- partially-applied state on a non-production database.
--
-- Reversibility: `ALTER TYPE "SubscriptionTier" RENAME VALUE 'PRO' TO
-- 'PROFESSIONAL';` reverses this cleanly. Couple that with reverting
-- the application-side shims (server/src/middleware/auth.ts JWT alias
-- and server/src/services/integration/stripe.ts legacy-price env) and
-- the rollover is fully two-way.

-- Enum value rename (touches every Subscription row transparently).
ALTER TYPE "SubscriptionTier" RENAME VALUE 'PROFESSIONAL' TO 'PRO';

-- Institution.tier is a plain `String @default('free')` column (NOT the
-- enum — it's a denormalised lowercase shadow used by code paths that
-- want to skip the Subscription join). Postgres won't touch it on
-- ALTER TYPE, so any row with the literal string 'professional' must
-- be rewritten here. Case-insensitive guard catches data inserted via
-- legacy admin tooling that may have mixed case.
UPDATE "Institution"
   SET "tier" = 'pro'
 WHERE LOWER("tier") = 'professional';

