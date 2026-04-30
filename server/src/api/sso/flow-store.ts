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

export async function takeFlowState(state: string): Promise<OidcFlowState | null> {
  const client = getRedis();
  if (client) {
    try {
      return await takeRedis(client, state);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'sso flow-store: redis take failed, falling back to in-memory',
      );
    }
  }
  memPrune(Date.now());
  const k = memKey(state);
  const entry = memStore.get(k);
  if (!entry) return null;
  memStore.delete(k);
  return entry.value;
}

/** Test hook: drop the in-memory cache. */
export function __resetFlowStoreForTests(): void {
  memStore.clear();
}
