-- Phase 10.10 — Q3 SSO account-collision policy.
-- When a user signed up via password and their institution later enables
-- SSO, the first SSO login links the IdP identity to this row by email
-- and flips passwordLoginDisabled = true so subsequent password logins
-- are rejected. The password hash stays in place for support / audit
-- review; auth.service.login just refuses to validate against it when
-- this flag is set.

ALTER TABLE "User" ADD COLUMN "passwordLoginDisabled" BOOLEAN NOT NULL DEFAULT false;
