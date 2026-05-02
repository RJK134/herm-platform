/**
 * Centralised Redis key namespaces (Phase 11.16 / S1).
 *
 * Every Redis key the platform reads or writes goes through one of the
 * builders below. This file is the single source of truth for the
 * key-prefix taxonomy — operators looking at `redis-cli KEYS *` should
 * be able to map every prefix back to a function here.
 *
 * Why a registry, not scattered string templates: ad-hoc prefixes have
 * already collided once (the `slo-replay-cache.ts` header comment said
 * `slo:replay:` while the code emitted `sso:slo:replay:` — fixed in
 * #83). Centralising prevents typos, surfaces accidental collisions
 * at code-review time, and gives ops a stable contract for monitoring
 * and TTL audits.
 *
 * Naming convention: each builder returns a fully-qualified key.
 * Prefixes are grouped by domain (`session`, `lockout`, `sso`) and
 * disambiguated by sub-namespace where needed. None of the builders
 * normalise input — callers are still responsible for lower-casing
 * emails or other identifier hygiene before constructing the key,
 * since the shape of normalisation differs per surface (lockout uses
 * sha-256, session uses raw jti, etc.).
 */

const SESSION_PREFIX = 'session';
const LOCKOUT_PREFIX = 'lockout';
const SSO_OIDC_FLOW_PREFIX = 'sso:oidc:flow';
const SSO_SLO_REPLAY_PREFIX = 'sso:slo:replay';

export const RedisKeys = {
  /** Active JWT session record keyed by jti. Stores `SessionRecord` JSON. */
  sessionByJti: (jti: string): string => `${SESSION_PREFIX}:jti:${jti}`,
  /** Revocation marker keyed by jti. Presence means revoked. */
  sessionRevoked: (jti: string): string => `${SESSION_PREFIX}:revoked:${jti}`,
  /** Reverse index: institutionId+nameId → set of jtis, for SAML SLO. */
  sessionByNameId: (institutionId: string, nameId: string): string =>
    `${SESSION_PREFIX}:nameid:${institutionId}:${nameId}`,

  /** Lockout fail counter (sliding-window ZSET) keyed by hashed email. */
  lockoutFail: (hashedEmail: string): string => `${LOCKOUT_PREFIX}:fail:${hashedEmail}`,
  /** Lockout marker (binary present-or-absent) keyed by hashed email. */
  lockoutLock: (hashedEmail: string): string => `${LOCKOUT_PREFIX}:lock:${hashedEmail}`,

  /** OIDC flow record keyed by state. Stored with EX+NX, single-use via GETDEL. */
  ssoOidcFlow: (state: string): string => `${SSO_OIDC_FLOW_PREFIX}:${state}`,

  /** SAML SLO replay record keyed by institutionId+requestId. */
  ssoSloReplay: (institutionId: string, requestId: string): string =>
    `${SSO_SLO_REPLAY_PREFIX}:${institutionId}:${requestId}`,
} as const;

/**
 * The set of prefixes used by the platform. Useful for ops dashboards
 * and integration tests that need to exhaustively flush/scan known
 * namespaces. Alphabetical to make additions reviewable.
 */
export const REDIS_KEY_PREFIXES = [
  LOCKOUT_PREFIX,
  SESSION_PREFIX,
  SSO_OIDC_FLOW_PREFIX,
  SSO_SLO_REPLAY_PREFIX,
] as const;
