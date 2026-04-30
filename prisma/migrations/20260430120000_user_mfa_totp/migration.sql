-- Phase 10.8 — TOTP-based multi-factor authentication.
-- Adds the per-user MFA secret + activation timestamp. The secret is set
-- by the enrolment endpoint and only becomes "enforced" once the verify
-- endpoint confirms a working TOTP code, at which point mfaEnabledAt is
-- stamped and the login flow gates on a TOTP challenge for that user.
-- Both columns are nullable: existing users default to no MFA.
-- See server/src/lib/mfa.ts and server/src/api/auth/mfa.controller.ts.

ALTER TABLE "User" ADD COLUMN "mfaSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "mfaEnabledAt" TIMESTAMP(3);
