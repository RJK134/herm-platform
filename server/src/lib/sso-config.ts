/**
 * SP-side configuration for SAML / OIDC flows (Phase 10.10).
 *
 * Per-tenant IdP config (entityId, certs, secrets) lives on the
 * `SsoIdentityProvider` Prisma row. THIS file holds SP-side identity
 * — the identity HERM presents to every IdP it talks to. There is one
 * SP per deployment, not per tenant.
 *
 * Three env vars (all optional with sensible dev defaults):
 *   SP_BASE_URL    Public origin of the API (e.g. https://api.example.ac.uk).
 *                  Used for SAML ACS + OIDC callback URLs. Defaults to
 *                  the dev API port (:3002).
 *   FRONTEND_URL   Public origin of the SPA (where the browser lands).
 *                  Used for the post-SSO redirect carrying the session
 *                  token. Defaults to the dev SPA port (:5173) — NEVER
 *                  to the API origin, which would deliver the user to
 *                  a backend route the SPA doesn't render.
 *   SP_ENTITY_ID   SAML entity ID. Defaults to `<SP_BASE_URL>/api/sso/sp`.
 *                  Override only if the IdP admin requires a specific
 *                  URI (UKAMF assigns a fixed entityID per registered SP).
 *
 * For UKAMF compliance the AuthnRequest and SP metadata must be signed
 * with an X.509 keypair. v1 ships UNSIGNED — sufficient for IdPs that
 * accept it, deferred for federation enrolment. Tracked in the open
 * questions list of docs/adr/0001-sso-architecture.md.
 */
const DEFAULT_SP_BASE_URL = 'http://localhost:3002';
const DEFAULT_FRONTEND_URL = 'http://localhost:5173';

export function getSpBaseUrl(): string {
  return process.env['SP_BASE_URL'] ?? DEFAULT_SP_BASE_URL;
}

/**
 * Browser-facing origin (where the SPA is served). Used for the
 * post-SSO redirect and any other user-agent navigation. Falls back
 * to the dev SPA port — never to the SP/API origin.
 */
export function getFrontendBaseUrl(): string {
  return process.env['FRONTEND_URL'] ?? DEFAULT_FRONTEND_URL;
}

export function getSpEntityId(): string {
  return process.env['SP_ENTITY_ID'] ?? `${getSpBaseUrl()}/api/sso/sp`;
}

export function getSamlAcsUrl(institutionSlug: string): string {
  return `${getSpBaseUrl()}/api/sso/${institutionSlug}/saml/acs`;
}

export function getOidcCallbackUrl(institutionSlug: string): string {
  return `${getSpBaseUrl()}/api/sso/${institutionSlug}/oidc/callback`;
}

/**
 * URL the auth flow eventually redirects the user-agent to with the
 * minted session token. The frontend's `/login/sso` route reads the
 * token from the query string and hands it to `AuthProvider`.
 */
export function getFrontendSsoCallbackUrl(token: string): string {
  return `${getFrontendBaseUrl()}/login/sso?token=${encodeURIComponent(token)}`;
}
