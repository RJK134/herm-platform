/**
 * Per-tenant OIDC helper (Phase 10.10).
 *
 * Wraps `openid-client` v6's flat functional API with HERM's defaults:
 *   - Authorization code flow with PKCE (S256)
 *   - Random state + nonce per attempt
 *   - id_token verification on callback (signature, iss, aud, exp, nonce)
 *   - PKCE / state / nonce held in `flow-store.ts` (Redis when configured)
 *
 * The Configuration object returned by `discovery()` is per-issuer; we
 * cache it in-process for an hour. Internally `openid-client` re-fetches
 * JWKS on a key-id miss so the cache TTL only governs discovery doc
 * refreshes, not signing-key rotation.
 *
 * v6 is ESM-only — fine; the project's root package.json sets
 * `"type": "module"`. Node 22 baseline (we run 22+ in CI and prod).
 */
import * as oidc from 'openid-client';
import { putFlowState, takeFlowState, type OidcFlowState } from './flow-store';
import { getOidcCallbackUrl } from '../../lib/sso-config';

export interface TenantOidcConfig {
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
}

interface CachedConfig {
  config: oidc.Configuration;
  fetchedAt: number;
}
const TTL_MS = 60 * 60 * 1000;
const configCache = new Map<string, CachedConfig>();

/**
 * Phase 11.13 follow-up (Bugbot HIGH on PR #75) — cache key includes
 * `clientId` so two OIDC IdPs sharing an issuer (e.g. two Azure AD
 * apps in the same Entra tenant) don't collide. Each `Configuration`
 * embeds the clientId/clientSecret it was discovered with; keying on
 * issuer alone would let the second IdP pick up the first's cached
 * Configuration and emit the wrong client_id (or send the wrong
 * client_secret on token exchange). clientId-not-secret keeps the
 * secret out of any cache-debug log line.
 */
function configCacheKey(idp: TenantOidcConfig): string {
  return `${idp.oidcIssuer}|${idp.oidcClientId}`;
}

async function getConfig(idp: TenantOidcConfig): Promise<oidc.Configuration> {
  const cacheKey = configCacheKey(idp);
  const hit = configCache.get(cacheKey);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) {
    return hit.config;
  }
  const issuerUrl = new URL(idp.oidcIssuer);
  // openid-client v6 rejects HTTP issuers by default. Production is
  // always HTTPS, but local dev (`oauth2-mock-server` in tests, the
  // occasional staging IdP behind a local tunnel) needs the opt-in.
  // We only relax this when (a) we're explicitly outside production
  // AND (b) the issuer URL itself is http: — so a misconfigured prod
  // deploy can't accidentally talk to a plaintext IdP.
  const allowInsecure = process.env['NODE_ENV'] !== 'production' && issuerUrl.protocol === 'http:';
  const config = await oidc.discovery(
    issuerUrl,
    idp.oidcClientId,
    idp.oidcClientSecret,
    undefined,
    allowInsecure ? { execute: [oidc.allowInsecureRequests] } : undefined,
  );
  configCache.set(cacheKey, { config, fetchedAt: Date.now() });
  return config;
}

/**
 * Begin an OIDC sign-in: builds the authorize URL and persists the
 * flow state keyed by `state`. The caller redirects the user-agent to
 * the returned URL.
 *
 * Phase 11.13 — when an institution has multiple enabled IdPs the
 * caller passes `idpId` so the callback resolves the EXACT IdP that
 * issued this flow (otherwise an institution with two OIDC providers
 * would always pick the highest-priority one at callback time and
 * exchange the code with the wrong client_secret).
 */
export async function buildOidcAuthorizeUrl(
  institutionSlug: string,
  idp: TenantOidcConfig,
  idpId?: string,
): Promise<string> {
  const config = await getConfig(idp);
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const redirectUri = getOidcCallbackUrl(institutionSlug);

  const flow: OidcFlowState = {
    slug: institutionSlug,
    codeVerifier,
    nonce,
    ...(idpId ? { idpId } : {}),
  };
  await putFlowState(state, flow);

  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });
  return url.href;
}

export interface OidcAssertion {
  email: string;
  name?: string;
  sub: string;
}

/**
 * Complete an OIDC sign-in. Validates the state matches a live flow
 * for this institution, exchanges the code for tokens (using the stored
 * PKCE verifier), verifies the id_token, and returns the verified
 * email + name claims.
 *
 * Single-use: `takeFlowState` GETDELs the record, so a replayed callback
 * URL fails with 401.
 */
export async function completeOidcCallback(
  institutionSlug: string,
  idp: TenantOidcConfig,
  callbackUrl: URL,
  receivedState: string,
): Promise<OidcAssertion> {
  const flow = await takeFlowState(receivedState);
  if (!flow) {
    throw new Error('OIDC flow expired or unknown state');
  }
  if (flow.slug !== institutionSlug) {
    throw new Error('OIDC flow slug mismatch');
  }
  const config = await getConfig(idp);
  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: flow.codeVerifier,
    expectedNonce: flow.nonce,
    expectedState: receivedState,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims) {
    throw new Error('OIDC token response did not include an id_token');
  }
  const email = typeof claims['email'] === 'string' ? claims['email'] : '';
  if (!email.includes('@')) {
    throw new Error('OIDC id_token missing email claim');
  }
  const sub = typeof claims['sub'] === 'string' ? claims['sub'] : '';
  const rawName = claims['name'];
  const name = typeof rawName === 'string' ? rawName : undefined;
  return { email, name, sub };
}

/**
 * Drop the cache entry for a specific {issuer, clientId} pair.
 *
 * Phase 11.15 (P11) — write-side invalidation hook for the admin SSO
 * upsert path. The cached `Configuration` object embeds the
 * `clientSecret` it was discovered with, so a secret rotation via the
 * admin UI would otherwise be invisible to this process for up to
 * `TTL_MS` (1h) and every token-exchange in that window would 401 at
 * the IdP — surfacing as the opaque `sso_failed` banner with no
 * obvious cause. Writes that mutate `oidcIssuer`, `oidcClientId`, or
 * `oidcClientSecret` (and disables / deletes) MUST call this so the
 * next OIDC flow re-discovers and picks up the new credentials.
 *
 * Returns whether an entry was actually removed — useful for tests
 * and metrics, but callers don't need to care about the return value
 * in production.
 *
 * Edge cases:
 *   - Issuer/clientId rotated: the cache key changed, so the OLD key
 *     must be invalidated. Callers that rotate either field should
 *     pass the old issuer + clientId here (the new key won't be in
 *     the cache yet, so invalidating it is a defensive no-op).
 *   - Secret-only rotation: the cache key is unchanged; pass the
 *     current issuer + clientId.
 *   - `null`/missing fields: silently no-ops (a row that has no
 *     OIDC issuer/clientId can't have produced a cache entry).
 */
export function invalidateOidcConfigCacheByKey(args: {
  oidcIssuer: string | null | undefined;
  oidcClientId: string | null | undefined;
}): boolean {
  if (!args.oidcIssuer || !args.oidcClientId) return false;
  const key = configCacheKey({
    oidcIssuer: args.oidcIssuer,
    oidcClientId: args.oidcClientId,
    oidcClientSecret: '',
  });
  return configCache.delete(key);
}

/** Test hook: drop the in-memory discovery-config cache. */
export function __resetOidcConfigCacheForTests(): void {
  configCache.clear();
}
