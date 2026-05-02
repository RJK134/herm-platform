-- Phase 11.16 (L3) — index Institution.domain for email-based SSO discovery.
--
-- `discoverByEmail` (server/src/api/sso/sso.controller.ts) extracts the
-- email's domain and queries `Institution.findFirst({ where: { domain } })`
-- on every probe. With no index this is a sequential scan; the existing
-- `discoveryRateLimiter` caps the surface at 30 req/min/IP but doesn't
-- change the per-query cost. A simple B-tree index turns the lookup into
-- an O(log n) probe.
--
-- The column is nullable; Postgres' default B-tree index handles NULL
-- values efficiently (they're stored at the end of the index and skipped
-- on equality scans). The Institution table sees write traffic only on
-- tenant onboarding / soft-delete cascade, so the in-transaction lock
-- this migration takes is short and uncontended in practice.

CREATE INDEX "Institution_domain_idx" ON "Institution"("domain");
