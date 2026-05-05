-- Phase 12 (UAT readiness) — replace the single-column `Institution_domain_idx`
-- with a composite index on (domain, createdAt) so it matches the datamodel
-- declared in `prisma/schema.prisma`. Without this migration, CI's
-- `Validate Prisma schema` job fails its drift check:
--
--   [-] Removed index on columns (domain)
--   [+] Added index on columns (domain, createdAt)
--
-- The composite index supports the deterministic oldest-match lookup used by
-- `discoverByEmail` (server/src/api/sso/sso.controller.ts), which is
-- equivalent to:
--
--   WHERE domain = ? ORDER BY createdAt ASC LIMIT 1
--
-- A B-tree on (domain, createdAt) lets Postgres satisfy both the equality
-- filter and the ordering directly from the index, avoiding a separate sort
-- over duplicate-domain rows. The leading column is nullable; Postgres'
-- default B-tree handles NULLs efficiently. Institution write traffic is
-- low (tenant onboarding / soft-delete cascade), so the in-transaction
-- locks taken here are short and uncontended.
--
-- Both DDL statements use IF EXISTS / IF NOT EXISTS so the migration is
-- safe to re-apply against a partially-migrated environment.

DROP INDEX IF EXISTS "Institution_domain_idx";

CREATE INDEX IF NOT EXISTS "Institution_domain_createdAt_idx"
  ON "Institution"("domain", "createdAt");
