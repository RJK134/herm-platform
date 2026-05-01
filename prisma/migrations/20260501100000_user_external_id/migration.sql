-- Phase 11.11 — SCIM 2.0 provisioning. Add `externalId` to User so
-- a SCIM client can track its own identifiers alongside the HERM row.
-- Composite-unique per institution so two different tenants can both
-- have an externalId of the same value without colliding.

ALTER TABLE "User" ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "User_institutionId_externalId_key" ON "User"("institutionId", "externalId");
