-- Phase 11.16 follow-up — fix migration / schema drift introduced by #85.
--
-- PR #85 added a single-column index on Institution.domain, but the
-- schema.prisma in the same PR declared a composite index on
-- (domain, createdAt) to support the deterministic oldest-match SSO
-- discovery query. The two never lined up, so `prisma migrate diff`
-- has been failing on every PR's `prisma-validate` job ever since.
--
-- This migration drops the single-column index and creates the
-- composite that schema.prisma actually declares. Idempotent (uses
-- IF EXISTS / IF NOT EXISTS) so reruns on environments that already
-- ran #85 don't fail.

DROP INDEX IF EXISTS "Institution_domain_idx";
CREATE INDEX IF NOT EXISTS "Institution_domain_createdAt_idx" ON "Institution"("domain", "createdAt");
