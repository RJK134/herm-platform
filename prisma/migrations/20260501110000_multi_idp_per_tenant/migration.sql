-- Phase 11.13 — multi-IdP per tenant.
-- Drop the unique constraint on `institutionId` so multiple SsoIdentityProvider
-- rows can coexist for one Institution. Add `priority` for ordering.
-- Replaces the implicit single-IdP-per-tenant model with an explicit
-- enumerated set; discovery sorts by `(enabled, priority)` and login
-- accepts an `idpId` query parameter to disambiguate.

DROP INDEX IF EXISTS "SsoIdentityProvider_institutionId_key";

ALTER TABLE "SsoIdentityProvider" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100;

CREATE INDEX "SsoIdentityProvider_institutionId_enabled_priority_idx"
  ON "SsoIdentityProvider"("institutionId", "enabled", "priority");
