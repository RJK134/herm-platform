-- Phase 14.8 — Enterprise RBAC role taxonomy.
-- Adds three new UserRole enum values requested by UAT report 4.1:
--   FINANCE     — TCO calculator + cost-comparison surfaces only
--   AUDITOR     — read-only access to audit logs + compliance views
--   STAKEHOLDER — read-only access to procurement narrative + scoring
-- Postgres ALTER TYPE ... ADD VALUE is non-transactional but additive
-- only; existing rows keep their current role.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'FINANCE';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'AUDITOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'STAKEHOLDER';
