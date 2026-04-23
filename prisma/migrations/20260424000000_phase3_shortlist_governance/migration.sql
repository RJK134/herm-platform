-- Phase 3: Shortlist governance fields.
-- Additive only — safe to apply on a live DB. No backfill required:
-- existing rows get the default 'pending' decisionStatus.

ALTER TABLE "ShortlistEntry"
  ADD COLUMN "decisionStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "rationale" TEXT,
  ADD COLUMN "decidedBy" TEXT,
  ADD COLUMN "decidedAt" TIMESTAMP(3);
