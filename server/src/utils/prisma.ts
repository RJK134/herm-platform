import { PrismaClient } from '@prisma/client';

/**
 * DB resilience defaults. Both are overridable per environment by setting
 * the corresponding query parameter on `DATABASE_URL`:
 *   - connection_limit  → Prisma client-side connection pool size
 *   - options           → libpq-style server-side GUCs (`-c key=value`),
 *                         used here to set `statement_timeout` so a runaway
 *                         query is killed by Postgres rather than pinning a
 *                         pool slot indefinitely
 *
 * If the operator already supplies either knob via `DATABASE_URL`, we leave
 * their value untouched. Defaults only apply when nothing is set.
 */
const DEFAULT_CONNECTION_LIMIT = '10';
const DEFAULT_STATEMENT_TIMEOUT_MS = '15000';

/**
 * Augments a postgres connection string with our resilience defaults.
 * Exported for testing — production code should consume the `prisma`
 * singleton below, which has these defaults pre-applied.
 */
export function applyConnectionDefaults(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return rawUrl;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // Pass through malformed URLs — Prisma will surface its own clearer error
    // when it tries to connect, and env-check has already warned at boot.
    return rawUrl;
  }

  const params = new URLSearchParams(url.search);

  if (!params.has('connection_limit')) {
    params.set('connection_limit', DEFAULT_CONNECTION_LIMIT);
  }

  if (!params.has('options')) {
    // libpq `-c` flag sets a PostgreSQL GUC for the session. statement_timeout
    // is in milliseconds — 15s is conservative for our query shapes (the
    // longest legitimate read is the leaderboard heatmap at ~3s on a warm
    // cache). Override by setting `options` explicitly on DATABASE_URL.
    params.set('options', `-c statement_timeout=${DEFAULT_STATEMENT_TIMEOUT_MS}`);
  }

  // URLSearchParams.toString() emits spaces as `+` (application/x-www-form-
  // urlencoded). libpq parses connection-string query params with strict
  // percent-encoding rules where `+` is a literal plus sign — so `+` in the
  // wire format would corrupt our `-c statement_timeout=…` option into the
  // unknown option name `-c+statement_timeout`. Encode with %20 instead.
  const query = encodePostgresQuery(params);

  // Rebuild from URL parts rather than touching `url.search` directly:
  // `URL.origin` returns 'null' for the postgresql: scheme in some Node
  // versions, so we assemble protocol + auth + host + path manually.
  const auth = url.password
    ? `${url.username}:${url.password}@`
    : url.username
      ? `${url.username}@`
      : '';
  return `${url.protocol}//${auth}${url.host}${url.pathname}${query ? `?${query}` : ''}`;
}

/**
 * Serializes a URLSearchParams to a query string using strict
 * percent-encoding (space → %20), not form-encoding (space → +).
 * libpq's connection-string parser requires %20 for spaces inside
 * the `options` value.
 */
function encodePostgresQuery(params: URLSearchParams): string {
  const parts: string[] = [];
  for (const [key, value] of params.entries()) {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.join('&');
}

const databaseUrl = applyConnectionDefaults(process.env['DATABASE_URL']);

/**
 * Some hosts (Vercel Hobby Functions, Claude Code's web sandbox, locked-
 * down corporate networks) only allow outbound HTTPS — no raw TCP to
 * Postgres on 5432. When `PRISMA_NEON_HTTP=1` is set, route Prisma
 * queries through the @neondatabase/serverless WebSocket pool instead,
 * which speaks the wire protocol over an HTTPS upgrade. Otherwise this
 * is a no-op and the standard libpq TCP path runs unchanged.
 *
 * This branch is required (not optional) for the live Vercel deploy at
 * https://herm-platform-client-*.vercel.app — without it every API
 * request returns DATABASE_UNAVAILABLE because the function host can't
 * reach Neon's TCP endpoint. Empirically demonstrated by master's
 * current production deploy, which lacks this path and 500s on every
 * read. Tracked under the Phase 13 audit.
 *
 * Uses the raw DATABASE_URL — Neon's pooled proxy rejects the
 * `options=-c statement_timeout=…` startup parameter that
 * applyConnectionDefaults() adds (Postgres error 08P01: "unsupported
 * startup parameter in options"). connection_limit is also irrelevant
 * here because the Neon pool manages connections at the edge.
 */
function makePrisma(): PrismaClient {
  if (process.env['PRISMA_NEON_HTTP'] === '1') {
    const rawUrl = process.env['DATABASE_URL'];
    if (!rawUrl) {
      throw new Error('PRISMA_NEON_HTTP=1 or USE_NEON_HTTP=1 requires DATABASE_URL to be set');
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool, neonConfig } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaNeon } = require('@prisma/adapter-neon') as typeof import('@prisma/adapter-neon');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ws = require('ws');
    neonConfig.webSocketConstructor = ws as typeof globalThis.WebSocket;
    const pool = new Pool({ connectionString: rawUrl });
    const adapter = new PrismaNeon(pool);
    return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
  }
  return databaseUrl
    ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    : new PrismaClient();
}

const prisma = makePrisma();

export default prisma;
