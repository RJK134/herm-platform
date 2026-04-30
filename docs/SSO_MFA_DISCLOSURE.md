# Single Sign-On & multi-factor authentication — what changes for your users

A one-page disclosure for institution administrators who are about to enable
SAML or OIDC sign-in on HERM. Tell your users this **before** you flip the IdP
on, especially if they have already enrolled in HERM's authenticator-app MFA.

---

## TL;DR

When your institution enables SSO, **HERM stops enforcing its own
authenticator-app step.** Your identity provider (Microsoft Entra ID, Okta,
Google Workspace, etc.) becomes the source of truth for "is this user
sufficiently authenticated, including any second factor." HERM trusts the
assertion you receive and mints a session straight away.

This is by design. The alternative — stacking HERM's TOTP on top of your IdP's
own MFA — is a poorer user experience without a meaningful security gain in the
mainstream case. It's the same model used by every other SaaS application that
delegates authentication to your federation.

The trade-off lives on you (the institution): make sure your IdP enforces MFA.
HERM cannot do it for you once SSO is on.

---

## What your users will notice

- **First SSO login** lands the user straight on the dashboard. No "scan this
  QR code" step, no six-digit code prompt from HERM.
- **Existing password accounts** are *linked* the first time they sign in via
  SSO with the same email address. After that, password login is **disabled**
  on that account; they must use SSO. (See the cross-institution rule below.)
- **Authenticator-app MFA enrolment** in HERM's `Settings → Security` page
  becomes a no-op for SSO users. The setting still exists, but the SSO path
  doesn't consult it. Removing the UI for SSO users is on the roadmap; until
  then it's harmless (the IdP gates the session anyway).
- **The audit log records `mfaBypassed: true`** on every SSO sign-in for users
  whose HERM-side TOTP was set. That's how your security team can trace the
  policy change later — it's not a vulnerability flag, it's the
  policy-as-coded.

---

## What you (the institution administrator) must do

1. **Verify your IdP's MFA policy.** If your tenant doesn't already require a
   second factor for HERM users, configure that on the IdP side **before** you
   enable SSO in HERM. After SSO is live, HERM is no longer a backstop.

2. **Send a one-line user comms.** Suggested wording:

   > From [date], you'll sign in to HERM with your [Microsoft / Google /
   > Okta / etc.] account. You don't need to set up the HERM authenticator
   > app any more — your normal sign-in process now covers that.

3. **Decide on JIT provisioning.** When SSO is enabled, by default an unknown
   email asserted by your IdP is **auto-provisioned** as a HERM user with the
   `VIEWER` role. If you'd rather pre-provision (e.g. only invited staff get
   accounts), uncheck the **JIT provisioning** flag on the IdP admin page
   (`/admin/sso`). Auto-provisioned users land with whatever role you set as
   the **default role** on that page.

4. **Plan for cross-institution moves.** HERM email addresses are globally
   unique. If a user moves between two institutions that both use HERM, the
   second institution's SSO will be **refused** for that email — by design,
   to prevent a malicious institution admin from claiming another tenant's
   user via an IdP assertion. The legitimate path is: an admin on the **old**
   institution renames or deletes the account first.

---

## What HERM still enforces after SSO is on

These are not bypassed and continue to apply to every SSO session:

- Tier gating (SSO is an Enterprise-tier feature; non-Enterprise institutions
  get an opaque 404 from the SSO endpoints).
- Per-tenant role-based access controls — your IdP decides *who*; HERM still
  decides *what* they can see and change inside HERM based on their role.
- Audit logging — every SSO login records `auth.sso.success`,
  `auth.sso.jit_provisioned`, or `auth.sso.account_linked`. Failed assertions
  record `auth.sso.fail`. Cross-institution rejections record
  `auth.sso.cross_institution_blocked`.
- The HERM-side rate limiter and incident-response paths.

---

## Why we made this choice

Documented in the SSO architecture decision record (see
[`docs/adr/0001-sso-architecture.md`](adr/0001-sso-architecture.md), question
Q10). Three reasons:

1. **The IdP already does it better.** Modern IdPs (Entra, Okta, Google, etc.)
   support hardware keys, conditional access, risk-based prompts, and offline
   recovery — all things HERM's stand-alone TOTP cannot match.
2. **User experience.** Two MFA prompts in a row erodes adoption. Users learn
   to click through them, which is the failure mode security teams worry
   about anyway.
3. **The boundary is auditable.** A single line in the audit log
   (`mfaBypassed: true`) makes the policy unambiguous and reviewable. A model
   where HERM sometimes did and sometimes didn't run TOTP would be the
   genuinely confusing one.

---

## Reverting

If your institution decides SSO isn't right for you yet:

1. Toggle the IdP **disabled** flag in HERM's `/admin/sso` page (don't delete
   it — that wipes your config).
2. Affected users sign in with their email and a password. Users whose
   `passwordLoginDisabled` flag was set during SSO linking will need an
   admin password reset (`/admin/users` → reset, or via Prisma).
3. Re-enrol HERM-side TOTP from `Settings → Security` if your security
   policy requires it.

There is no automatic rollback for `passwordLoginDisabled` because the
HERM password hash for those users is empty (SSO-only); a fresh password must
be set. We can ship a SUPER_ADMIN-driven bulk reset if your deployment hits
this case at scale.

---

## Questions

- Operator-level questions: see the [RUNBOOK env-var matrix](../RUNBOOK.md).
- Architecture & design rationale: [`docs/adr/0001-sso-architecture.md`](adr/0001-sso-architecture.md).
- Anything else: file a support ticket.
