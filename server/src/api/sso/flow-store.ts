/**
 * Server-side flow state for SP-initiated OIDC (Phase 10.10).
 *
 * The OIDC authorization-code-with-PKCE flow needs to remember between
 * the authorize redirect and the callback:
 *   - the institution slug (so the callback knows which IdP config to
 *     load — never trust the slug from the IdP response)
 *   - the PKCE code_verifier (so the callback can prove the same client
 *     started the flow)
 *   - the nonce (verified against the id_token claim)
 *
 * The original `redirect_uri` is NOT stored: it's a deterministic
 * function of the slug (`/api/sso/:slug/oidc/callback`), and
 * `openid-client` reconstructs it from the callback URL the IdP
 * redirected to, then sends it on the token-exchange POST. Storing
 * it here would be dead state at best and a source of drift at worst
 * (the stored copy could lag a deploy that changed `SP_BASE_URL`).
 *
 * `state` is a random string that doubles as the lookup key. We use
 * `GETDEL` so reading the flow record atomically deletes it — replay
 * protection without a separate "consumed" flag.
 *
 * Backed by Redis when REDIS_URL is set. Falls back to an in-process Map
 * when not — local dev still works, multi-instance prod doesn't (the
 * authorize-side instance might be different from the callback-side
 * instance). Operators MUST set REDIS_URL when running multi-replica.
 *
 * The fall-back is the same fail-open posture as the lockout module:
 * an OIDC flow that fails because the verifier landed on the wrong pod
 * is recoverable by retry; an outage caused by a Redis blip is not.
 */
import type { Redis } from 'ioredis';
import { getRedis } from '../../lib/redis';
import { logger } from '../../lib/logger';

export interface OidcFlowState {
  slug: string;
  codeVerifier: string;
  nonce: string;
  /**
   * Phase 11.13 — when an institution has multiple enabled IdPs, the
   * authorize-side captures `idpId` so the callback resolves the EXACT
   * IdP that issued this flow. Optional for back-compat with single-IdP
   * tenants whose flow records were written before the column existed.
   */
  idpId?: string;
}

const KEY_PREFIX = 'sso:oidc:flow';
const TTL_SECONDS = 600; // 10 min — covers IdP login UX + a re-prompt

const memStore = new Map<string, { value: OidcFlowState; expiresAt: number }>();

function memKey(state: string): string {
  return `${KEY_PREFIX}:${state}`;
}

function memPrune(now: number): void {
  for (const [k, v] of memStore) {
    if (v.expiresAt <= now) memStore.delete(k);
  }
}

async function putRedis(client: Redis, state: string, value: OidcFlowState): Promise<void> {
  await client.set(memKey(state), JSON.stringify(value), 'EX', TTL_SECONDS, 'NX');
}

async function takeRedis(client: Redis, state: string): Promise<OidcFlowState | null> {
  // GETDEL: atomic read-and-delete. Single-use; replay rejects.
  const raw = await client.getdel(memKey(state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OidcFlowState;
  } catch {
    return null;
  }
}

async function peekRedis(client: Redis, state: string): Promise<OidcFlowState | null> {
  const raw = await client.get(memKey(state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OidcFlowState;
  } catch {
    return null;
  }
}

export async function putFlowState(state: string, value: OidcFlowState): Promise<void> {
  const client = getRedis();
  if (client) {
    try {
      await putRedis(client, state, value);
      return;
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'sso flow-store: redis put failed, falling back to in-memory',
      );
    }
  }
  memStore.set(memKey(state), {
    value,
    expiresAt: Date.now() + TTL_SECONDS * 1000,
  });
}

/**
 * Atomic single-use read of a flow record. Fail-closed when Redis is
 * configured: a transient Redis error during take must NOT silently
 * fall back to the in-memory Map.
 *
 * The original `take`-falls-through-to-memStore behaviour was a Phase
 * 11.13 oversight (peek already fails closed for the same reason).
 * The risk: the put-side stored the record in Redis, the take-side
 * Redis call blips, the fallback hits the (empty) memStore, and the
 * caller treats the state as unknown — racing with a retry that
 * succeeds against Redis once the blip clears. Throwing here causes
 * the OIDC callback to redirect to the failure page without consuming
 * the flow state; the user retries cleanly.
 */
export async function takeFlowState(state: string): Promise<OidcFlowState | null> {
  const client = getRedis();
  if (client) {
    // Intentionally no try/catch when Redis is configured: propagate
    // the error to the caller. peekFlowState uses the same posture.
    return await takeRedis(client, state);
  }
  memPrune(Date.now());
  const k = memKey(state);
  const entry = memStore.get(k);
  if (!entry) return null;
  memStore.delete(k);
  return entry.value;
}

/**
 * Phase 11.13 — non-destructive read of a flow record. Used by the
 * OIDC callback to learn which `idpId` issued the flow before the
 * destructive `takeFlowState` call. Returns null when the state is
 * unknown / expired. Does NOT extend the TTL — the subsequent take
 * still has the original window to land within.
 *
 * Fail-closed when Redis is configured: a transient Redis error during
 * peek must NOT silently fall through to the in-memory store. If it did,
 * `resolveSsoForFlow` would pick the primary (wrong) IdP, and the
 * subsequent `takeFlowState` — which retries Redis and succeeds — would
 * consume the state while token exchange happened against the wrong
 * client_secret, turning a recoverable blip into a guaranteed auth failure.
 * Throwing here causes the callback to redirect to the failure page without
 * consuming the flow state, so the user can retry.
 */
export async function peekFlowState(state: string): Promise<OidcFlowState | null> {
  const client = getRedis();
  if (client) {
    // Intentionally no try/catch: propagate Redis errors to the caller so
    // the OIDC callback fails closed rather than proceeding with the wrong IdP.
    return await peekRedis(client, state);
  }
  memPrune(Date.now());
  const entry = memStore.get(memKey(state));
  return entry ? entry.value : null;
}

/** Test hook: drop the in-memory cache. */
export function __resetFlowStoreForTests(): void {
  memStore.clear();
}
