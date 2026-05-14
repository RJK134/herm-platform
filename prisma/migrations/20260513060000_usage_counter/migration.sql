-- Phase 15.3 — UsageCounter table.
--
-- The persistence side of quota enforcement. `enforceQuota` middleware
-- reads the row for the current YYYY-MM window before allowing a write;
-- `recordUsage()` increments it after the write succeeds.
--
-- The composite UNIQUE on (institutionId, metric, period) supports the
-- upsert-on-write pattern in `recordUsage()` — Postgres's
-- `INSERT ... ON CONFLICT (institutionId, metric, period) DO UPDATE
-- SET count = count + 1` resolves both the first-write-of-the-month
-- insert and same-month increments in one round-trip.
--
-- (institutionId, period) compound index supports the "show me this
-- tenant's full usage for the current window" read path that the
-- forthcoming /api/usage endpoint will use. Postgres already has a
-- separate single-column index implied by the composite unique, so we
-- don't redundantly index (institutionId) alone.
--
-- Reversible via `DROP TABLE "UsageCounter";` — no foreign-key fanout,
-- and Institution.usageCounters relation is back-reference-only so
-- dropping the table cleans up cleanly.

CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageCounter_institutionId_metric_period_key"
  ON "UsageCounter"("institutionId", "metric", "period");

CREATE INDEX "UsageCounter_institutionId_period_idx"
  ON "UsageCounter"("institutionId", "period");

ALTER TABLE "UsageCounter"
  ADD CONSTRAINT "UsageCounter_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "Institution"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
