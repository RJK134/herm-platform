# ADR 0001 — Single Sign-On architecture

**Status:** scaffold only. Schema + discovery endpoint shipped in PR #51 (Phase 10.7). Auth flows pending implementation.

**Context:** UK higher-education customers (the platform's primary buyers) require SSO via the **UK Access Management Federation** (UKAMF) for IT-services procurement. The federation is SAML 2.0. A subset of customers also operate Microsoft Entra ID (formerly Azure AD), Okta, or Google Workspace and would prefer **OIDC** for those tenants.

**Decision:** support **both SAML 2.0 and OIDC**, configured **per institution** (one IdP per tenant). Default authentication remains password + JWT for institutions without an SSO row.

---

## Goals

1. **Per-tenant configuration** — each Institution row can have at most one SsoIdentityProvider row. Different customers run different IdPs; the platform picks the right config from the discovery URL.
2. **Stable contract before flows** — ship the schema and discovery endpoint first so the frontend, deploy story, and database migration can be reviewed independently of the auth flows themselves. Implementation lands incrementally.
3. **Audit-trail parity with password auth** — every `auth.login.success`, `auth.login.fail`, and (where applicable) `auth.lockout.engaged` audit row continues to be emitted via the same `lib/audit.ts` helper. SSO logins emit `auth.sso.success` / `auth.sso.fail` with the IdP id in `changes`.
4. **JIT provisioning** by default. An unknown user from a trusted IdP gets a User row created with `defaultRole = VIEWER` and `institutionId` derived from the SSO config. Pre-provisioned mode (`jitProvisioning = false`) is supported for institutions whose security review forbids JIT.

## Non-goals (this PR)

- Working SAML/OIDC flows (separate implementation PR — see "Open questions" below)
- IdP-initiated SSO (we accept SP-initiated only — UKAMF supports both, but SP-initiated is sufficient for v1)
- SCIM provisioning (manual + JIT only for now)
- WS-Federation (Microsoft legacy — Entra ID supports OIDC and we direct customers there)
- Account linking UI (a user already in HERM via password who later joins an SSO IdP — collision strategy is in "Open questions")

---

## Library choice

**SAML:** **`node-saml`** (the modern fork; `passport-saml` wraps it with Passport-specific glue). Reasoning:
- Active maintenance (passport-saml is essentially a thin Passport adapter; node-saml does the actual work)
- TypeScript types in DefinitelyTyped
- Used in production at scale
- Supports XML signature verification using a pluggable cert source — good for our per-tenant cert storage

**OIDC:** **`openid-client`**. Reasoning:
- Reference implementation by panva (a contributor to the OIDC spec)
- Handles discovery, JWK rotation, PKCE, refresh-token flow
- Drop-in for any compliant IdP (Entra, Okta, Google, Auth0)

Both libraries integrate cleanly with our stateless JWT model: on successful IdP assertion verification, we mint a normal HERM JWT (the same `generateToken` from `middleware/auth.ts`) and the rest of the platform sees a normal authenticated user. **No session cookies, no Passport session middleware.**

## Data model

See `prisma/schema.prisma` for the canonical schema. Summary:

```
SsoIdentityProvider
  id              cuid
  institutionId   FK → Institution (unique)
  protocol        SAML | OIDC
  displayName     "Sign in with University of Example"
  samlEntityId    / samlSsoUrl / samlCert      (SAML only)
  oidcIssuer / oidcClientId / oidcClientSecret (OIDC only)
  jitProvisioning bool (default true)
  defaultRole     UserRole (default VIEWER)
  enabled         bool (default false — staged config)
```

Per-institution unique constraint on `institutionId` prevents two IdPs on the same tenant. **Multiple IdPs per tenant** (e.g. main university + a department's IdP) is deferred — needs a tie-breaker on the discovery page.

The `oidcClientSecret` and `samlCert` columns are written and read **as-is** at the database layer. **At rest encryption** is the deployment's responsibility (Postgres TDE, AWS RDS at-rest, etc.). Application-level encryption with envelope keys is a future enhancement; the contract is that operators MUST treat this column as sensitive.

## Discovery flow (this PR)

```
GET /api/sso/:institutionSlug/discover
  → 404 NOT_FOUND      if no SsoIdentityProvider row, or row.enabled = false
  → 200 { protocol, displayName, loginUrl }   when configured
```

The frontend uses this endpoint at the `/login?email=user@example.ac.uk` page to:
1. Extract the email domain.
2. Resolve the Institution by `domain` column.
3. Call discovery on the institution slug.
4. If 200 with `loginUrl`, redirect there. If 404, fall through to password login.

The discovery endpoint **does not** authenticate the caller — it only reveals "is SSO available for this slug" — same information visible from the institution's own login page anyway.

## Login flow (next PR — SAML branch)

```
GET  /api/sso/:slug/login                  → SAML AuthnRequest, redirect to IdP
POST /api/sso/:slug/saml/acs               → ACS endpoint, parses SAML response,
                                             verifies signature, JIT-provisions or
                                             matches user, mints HERM JWT,
                                             302 to FRONTEND_URL/login/sso?token=...
```

The token-in-redirect-param is acceptable because the redirect target is HTTPS and the FRONTEND_URL is configured per-deployment. Alternative — POSTing the token to a frontend-handled callback — is a follow-up if a customer's IdP balks.

## Login flow (next PR — OIDC branch)

```
GET  /api/sso/:slug/login                  → OIDC authorize redirect (PKCE),
                                             RelayState carries the slug
GET  /api/sso/:slug/oidc/callback          → exchanges code for tokens,
                                             validates id_token, JIT-provisions,
                                             mints HERM JWT, 302 to frontend
```

## Attribute mapping

SAML: NameID = email; `displayName` (SAML attr) → User.name. Other attributes ignored for v1.

OIDC: `email` claim → User.email; `name` claim → User.name. Email is required; absence → 400 with a clear error directing the IdP admin to release `email`.

## Session lifetime

HERM JWT default 7 days remains. **We don't sync to the IdP session lifetime** — that would require front-channel logout and a session store. Adequate for v1; document on the customer onboarding page that "single sign-out" is not supported and users must explicitly sign out of HERM.

---

## Open questions (for the implementing engineer)

1. **Single Logout (SLO).** Skipped for v1. If a customer demands it, plan: implement SAML SLO (HTTP-Redirect binding) and require a Redis-backed session store so we can invalidate the JWT on the back channel. Scope: medium.

2. **IdP cert rotation.** Operator-driven for v1. UKAMF publishes a federation metadata feed; auto-rotation by polling that feed is a follow-up. Until then, the institution admin pastes the new cert into the SSO config UI.

3. **Account collision when a user joins both worlds.** A user signs up via password as `j@uni.ac.uk`, then later their institution turns on SSO and the IdP returns the same email. **Recommendation:** on first SSO login, **link** the IdP identity to the existing User row (matched by email) and lock-out password login for that account from then on. Audit-log the link event.

4. **Failed-login lockout for SSO.** Lockout (Phase 10.5) keys on email. SSO login failures should NOT trigger lockout — the IdP is the source of truth for credential failures. Skip the lockout module on the SSO path.

5. **SP metadata XML.** SAML IdPs typically need our SP metadata to configure trust. Expose `GET /api/sso/sp-metadata.xml` — single document, signed (or static for v1). Owner: same engineer.

6. **CI testing.** Use [`saml-test-idp`](https://www.npmjs.com/package/saml-test-idp) and [`mock-oidc-server`](https://www.npmjs.com/package/oauth2-mock-server) as in-process IdPs. Live federation testing happens in staging against UKAMF's staging IdP.

7. **Tier-gating SSO.** Should SSO be Enterprise-only? Current recommendation: **yes**. Update `tierGate` middleware on the SSO routes once flows ship. Enforces a clear upgrade path for HE customers above the free / professional tiers.

8. **Multi-IdP per tenant.** Out of scope for v1 — unique constraint on `institutionId` enforces. If a customer demands it (e.g. they run two student-facing IdPs and a staff IdP), drop the unique constraint, add `priority`, and have discovery return an array.

9. **SCIM provisioning.** Out of scope for v1. JIT covers the common case. Customers who need bulk pre-provisioning currently use the existing admin "invite users" flow; a SCIM `/Users` endpoint can land later behind the API-key auth (Phase 9).

10. **MFA interaction.** If P10 ever ships TOTP MFA on the password path, SSO bypasses it (the IdP enforces MFA). Document this on the customer-facing onboarding page so an SSO-enabled tenant doesn't expect HERM-side MFA.

---

## Verification (this PR — scaffold only)

- `npm run verify` PASS.
- `npx prisma migrate status` shows the new migration applied cleanly.
- `GET /api/sso/<unknown-slug>/discover` → 404 with `code = "SSO_NOT_CONFIGURED"`.
- `GET /api/sso/<slug-of-institution-with-disabled-row>/discover` → 404.
- A row with `enabled = true` is invisible until the auth flows land — discovery returns the IdP's display name + a placeholder `loginUrl` that 404s if hit. The frontend treats a placeholder as "show password login" until the rollout completes.

## References

- UK Access Management Federation: https://www.ukfederation.org.uk/
- SAML 2.0 spec: https://docs.oasis-open.org/security/saml/v2.0/saml-core-2.0-os.pdf
- OIDC Core: https://openid.net/specs/openid-connect-core-1_0.html
- node-saml: https://github.com/node-saml/node-saml
- openid-client: https://github.com/panva/openid-client
