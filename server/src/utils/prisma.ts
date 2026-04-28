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

  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', DEFAULT_CONNECTION_LIMIT);
  }

  if (!url.searchParams.has('options')) {
    // libpq `-c` flag sets a PostgreSQL GUC for the session. statement_timeout
    // is in milliseconds — 15s is conservative for our query shapes (the
    // longest legitimate read is the leaderboard heatmap at ~3s on a warm
    // cache). Override by setting `options` explicitly on DATABASE_URL.
    url.searchParams.set('options', `-c statement_timeout=${DEFAULT_STATEMENT_TIMEOUT_MS}`);
  }

  return url.toString();
}

const databaseUrl = applyConnectionDefaults(process.env['DATABASE_URL']);

const prisma = databaseUrl
  ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  : new PrismaClient();

export default prisma;
