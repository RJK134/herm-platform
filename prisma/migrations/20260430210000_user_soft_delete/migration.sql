-- Phase 11.9 — User soft delete + retention.
--
-- The GDPR erasure path (Article 17) was a hard `prisma.user.delete`
-- before this migration. That worked but had two operational gaps:
--   1. No grace period — an accidental erasure was unrecoverable
--      until the next backup restore.
--   2. No retention policy beyond "until the next backup restore".
--
-- This migration adds a soft-delete column. The erasure path now
-- stamps `deletedAt = now()` and scrubs the PII columns. A retention
-- scheduler (server/src/services/retention/scheduler.ts) hard-deletes
-- rows whose `deletedAt` is older than RETENTION_GRACE_DAYS.
--
-- The new index supports the scheduler's range scan. It's a partial-
-- index pattern (most rows have NULL) so it stays small.

ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
