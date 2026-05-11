-- Phase 14.2b — add regulationVersion to GeneratedDocument so generated
-- procurement documents are clearly tagged with the regulatory regime
-- under which they were issued (PA2023 from 24 February 2025 onwards;
-- pre-existing rows stay null = "legacy").
ALTER TABLE "GeneratedDocument" ADD COLUMN "regulationVersion" TEXT;
