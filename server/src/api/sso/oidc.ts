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
import { createHash } from 'node:crypto';
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

/**
 * Bounded cache size cap. Keeps memory bounded even under pathological
 * rotation patterns where every secret rotation creates a new entry
 * (the fingerprint in the cache key changes, so the old entry would
 * otherwise live until TTL eviction on access — never, if no one
 * looks it up again). 256 is comfortably above the IdP count we'd
 * expect any single deployment to host (most deployments have a few
 * dozen at most), and small enough that the LRU sweep on overflow is
 * trivially cheap.
 */
const MAX_CACHE_SIZE = 256;
const configCache = new Map<string, CachedConfig>();

/**
 * Phase 11.13 follow-up — cache key includes `clientId` so two OIDC
 * IdPs sharing an issuer (e.g. two Azure AD apps in the same Entra
 * tenant) don't collide. Each `Configuration` embeds the
 * clientId/clientSecret it was discovered with; keying on issuer
 * alone would let the second IdP pick up the first's cached
 * Configuration and emit the wrong client_id (or send the wrong
 * client_secret on token exchange).
 *
 * Phase 11.16 follow-up (Copilot review on PR #77) — also include a
 * non-reversible fingerprint of the client_secret. Without it, an
 * IdP that rotates its secret (same issuer + same clientId, new
 * secret) would keep using the old secret from cache for up to
 * `TTL_MS` (1 hour) and every token exchange would 401. The
 * fingerprint is the first 16 hex chars of SHA-256(secret) — short
 * enough to keep the key small, long enough to make collisions
 * practically impossible, and never reveals the raw secret in any
 * cache-debug log line.
 *
 * Phase 11.16 (Copilot review on PR #82) — issuer and clientId are
 * URL-encoded before joining with `|`. Without encoding, a clientId
 * that contains a literal `|` (rare but allowed) would let prefix
 * invalidation accidentally evict unrelated cache entries: e.g.
 * invalidating `{issuer, clientId='foo'}` would also match a cache
 * entry for `{issuer, clientId='foo|bar'}`. encodeURIComponent emits
 * `%7C` for `|`, so the delimiter in the joined key is unambiguous.
 * The fingerprint is hex (`[0-9a-f]+`) and needs no encoding.
 */
function configCacheKey(idp: TenantOidcConfig): string {
  const secretFingerprint = createHash('sha256')
    .update(idp.oidcClientSecret)
    .digest('hex')
    .slice(0, 16);
  return `${encodeURIComponent(idp.oidcIssuer)}|${encodeURIComponent(idp.oidcClientId)}|${secretFingerprint}`;
}

/**
 * Walk the cache and drop entries older than TTL. Cheap (the cache is
 * size-bounded by MAX_CACHE_SIZE) and called opportunistically before
 * any new write so orphaned entries from rotated secrets don't survive
 * indefinitely. Without this, the lazy TTL check in `getConfig` only
 * fires on lookup of the same key — a key that's been rotated away
 * from is never looked up again, so its entry would persist until
 * process restart.
 */
function pruneExpired(now: number): void {
  for (const [k, v] of configCache) {
    if (now - v.fetchedAt >= TTL_MS) configCache.delete(k);
  }
}

async function getConfig(idp: TenantOidcConfig): Promise<oidc.Configuration> {
  const cacheKey = configCacheKey(idp);
  const now = Date.now();
  const hit = configCache.get(cacheKey);
  if (hit && now - hit.fetchedAt < TTL_MS) {
    // LRU touch: re-insert so this entry moves to the back of Map's
    // insertion order. On subsequent capacity-overflow eviction the
    // recently-used entry is preserved.
    configCache.delete(cacheKey);
    configCache.set(cacheKey, hit);
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
  // Active eviction before any growth: drop expired entries first, then
  // LRU-evict the oldest if we're still over the cap.
  pruneExpired(now);
  while (configCache.size >= MAX_CACHE_SIZE) {
    const oldest = configCache.keys().next().value;
    if (oldest === undefined) break;
    configCache.delete(oldest);
  }
  configCache.set(cacheKey, { config, fetchedAt: now });
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
 * Drop all cache entries for a specific {issuer, clientId} pair.
 *
 * Phase 11.15 (P11) — write-side invalidation hook for the admin SSO
 * upsert path. Writes that rotate `oidcIssuer` or `oidcClientId` (and
 * disables / deletes) call this with the OLD {issuer, clientId} so the
 * stale cache entry doesn't survive until TTL expiry.
 *
 * Phase 11.16 added a secret fingerprint to the cache key so a
 * secret-only rotation automatically yields a cache miss without an
 * explicit invalidation call. This function uses a prefix scan
 * (`${issuer}|${clientId}|*`) so it correctly finds and removes entries
 * regardless of which fingerprint they were stored under — covering
 * both the issuer/clientId-rotation case and the delete case where the
 * exact secret is no longer known.
 *
 * Phase 11.16 (Copilot review on PR #82) — issuer and clientId are
 * URL-encoded into the cache key, so the prefix used for matching is
 * also URL-encoded. Without this, a clientId of `foo` would erroneously
 * evict cache entries whose clientId was `foo|bar` (delimiter
 * collision). With encoding, the encoded `|` in the entry key is
 * `%7C`, so an unrelated clientId can't be matched.
 *
 * Returns whether at least one entry was actually removed — useful for
 * tests and metrics, but callers don't need to care in production.
 *
 * Edge cases:
 *   - Issuer/clientId rotated: pass the OLD issuer + clientId; the new
 *     key won't be in the cache yet, so invalidating it is a no-op.
 *   - Delete: pass the deleted row's issuer + clientId; removes the
 *     lingering entry so a same-key re-create within the TTL window
 *     doesn't surface stale config.
 *   - `null`/missing fields: silently no-ops (a row without OIDC
 *     issuer/clientId can't have produced a cache entry).
 */
export function invalidateOidcConfigCacheByKey(args: {
  oidcIssuer: string | null | undefined;
  oidcClientId: string | null | undefined;
}): boolean {
  if (!args.oidcIssuer || !args.oidcClientId) return false;
  const prefix = `${encodeURIComponent(args.oidcIssuer)}|${encodeURIComponent(args.oidcClientId)}|`;
  let removed = false;
  for (const key of configCache.keys()) {
    if (key.startsWith(prefix)) {
      configCache.delete(key);
      removed = true;
    }
  }
  return removed;
}

/** Test hook: drop the in-memory discovery-config cache. */
export function __resetOidcConfigCacheForTests(): void {
  configCache.clear();
}

/** Test hook: read current cache size for assertions. */
export function __oidcConfigCacheSizeForTests(): number {
  return configCache.size;
}
