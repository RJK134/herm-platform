-- Phase 11.14 — soft-delete cascade for Institution + Subscription.
-- Adds `deletedAt` to both, with indexes for the retention scheduler
-- sweep. Cascade behaviour (stamping User.deletedAt + scrubbing PII
-- + setting Subscription.deletedAt + tombstoning the Institution)
-- lives in the application service layer, not as a database trigger,
-- so the audit pipeline can record one row per cascade step.

ALTER TABLE "Institution" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Institution_deletedAt_idx" ON "Institution"("deletedAt");

ALTER TABLE "Subscription" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Subscription_deletedAt_idx" ON "Subscription"("deletedAt");
