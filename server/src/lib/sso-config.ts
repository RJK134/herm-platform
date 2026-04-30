/**
 * SP-side configuration for SAML / OIDC flows (Phase 10.10).
 *
 * Per-tenant IdP config (entityId, certs, secrets) lives on the
 * `SsoIdentityProvider` Prisma row. THIS file holds SP-side identity
 * — the identity HERM presents to every IdP it talks to. There is one
 * SP per deployment, not per tenant.
 *
 * Three env vars. Sensible dev defaults; the first two are
 * REQUIRED in production and validated up-front by `checkEnvironment()`
 * at boot, so a misconfigured prod deploy fails fast rather than
 * generating localhost callback URLs and 302-ing session tokens to
 * wrong origins:
 *
 *   SP_BASE_URL    Public origin of the API (e.g. https://api.example.ac.uk).
 *                  Used for SAML ACS + OIDC callback URLs. Defaults to
 *                  the dev API port (:3002) outside production.
 *   FRONTEND_URL   Public origin of the SPA (where the browser lands).
 *                  Used for the post-SSO redirect carrying the session
 *                  token. Defaults to the dev SPA port (:5173) outside
 *                  production. NEVER point this at the API origin,
 *                  which would deliver the user to a backend route the
 *                  SPA doesn't render.
 *   SP_ENTITY_ID   SAML entity ID. Defaults to `<SP_BASE_URL>/api/sso/sp`.
 *                  Override only if the IdP admin requires a specific
 *                  URI (UKAMF assigns a fixed entityID per registered SP).
 *                  Optional in every environment.
 *
 * For UKAMF compliance the AuthnRequest and SP metadata must be signed
 * with an X.509 keypair. v1 ships UNSIGNED — sufficient for IdPs that
 * accept it, deferred for federation enrolment. Tracked in the open
 * questions list of docs/adr/0001-sso-architecture.md.
 */
const DEFAULT_SP_BASE_URL = 'http://localhost:3002';
const DEFAULT_FRONTEND_URL = 'http://localhost:5173';

/**
 * SP/API origin (where ACS + OIDC callback routes live). Validated as
 * required in production by `checkEnvironment()`; the runtime throw
 * here is defence-in-depth for the case where someone removes the
 * env-check entry and a prod deploy boots without it.
 */
export function getSpBaseUrl(): string {
  const url = process.env['SP_BASE_URL'];
  if (url) return url;
  if (process.env['NODE_ENV'] !== 'production') return DEFAULT_SP_BASE_URL;
  throw new Error(
    'SP_BASE_URL must be set in production: SAML ACS / OIDC callback URLs would otherwise point at localhost.',
  );
}

/**
 * Browser-facing origin (where the SPA is served). Used for the
 * post-SSO redirect (which carries the session JWT in the query
 * string) and any other user-agent navigation. Validated as required
 * in production by `checkEnvironment()`; runtime throw is
 * defence-in-depth.
 */
export function getFrontendBaseUrl(): string {
  const frontendUrl = process.env['FRONTEND_URL'];
  if (frontendUrl) return frontendUrl;
  if (process.env['NODE_ENV'] !== 'production') return DEFAULT_FRONTEND_URL;
  throw new Error(
    'FRONTEND_URL must be set in production for SSO redirects; refusing to fall back to localhost.',
  );
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
