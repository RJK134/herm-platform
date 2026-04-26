-- Tenant scoping: add nullable institutionId column + index to IntegrationAssessment.
-- Additive only, safe on a live DB. Existing rows get NULL — they will be invisible
-- to authenticated tenants reading their own assessments, which is the desired
-- behaviour (those rows pre-date the JWT-required policy and have no owner claim).
--
-- Convention matches the other persisted-artefact tables (TcoEstimate,
-- ValueAnalysis, ArchitectureAssessment, GeneratedDocument): raw FK column,
-- no DB-level FOREIGN KEY constraint, no Prisma `@relation` decl.

ALTER TABLE "IntegrationAssessment"
  ADD COLUMN "institutionId" TEXT;

CREATE INDEX "IntegrationAssessment_institutionId_idx"
  ON "IntegrationAssessment"("institutionId");
