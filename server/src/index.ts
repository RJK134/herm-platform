// Sentry must initialise before anything else so the SDK's instrumentation
// hooks are in place by the time prisma / app middleware loads. No-op when
// SENTRY_DSN is unset, so dev / test paths are unaffected.
import { initSentry, flushSentry } from './lib/sentry';
initSentry();

import prisma from './utils/prisma';
import { createApp } from './app';
import { PRODUCT } from './lib/branding';
import { logger } from './lib/logger';
import { startRetentionScheduler, stopRetentionScheduler } from './services/retention/scheduler';

const app = createApp();
const PORT = Number(process.env['PORT'] ?? 3002);

/**
 * Extract host:port from DATABASE_URL for logs — without leaking credentials.
 * Returns "unknown" if the URL is missing or malformed.
 */
function dbTarget(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) return 'unknown (DATABASE_URL not set)';
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || '5432'}`;
  } catch {
    return 'unknown';
  }
}

// Ping the database at startup so connection problems (wrong port, stale
// credentials, Postgres not running) surface immediately in the developer's
// terminal — instead of only appearing as a 5xx on the first API call that
// touches the DB, which is what triggered the "login 500" reports after the
// docker-compose port change in PR #9.
//
// Non-blocking: the server still binds so /api/health stays up for container
// orchestrators (it doesn't hit the DB). The warning is loud and actionable.
prisma
  .$connect()
  .then(() => logger.info({ db: dbTarget() }, 'database connection ok'))
  .catch((err: Error) => {
    logger.error(
      { db: dbTarget(), err: err.message },
      'DATABASE UNREACHABLE — check DATABASE_URL in .env and that Postgres is running. ' +
        'If you upgraded past PR #9, docker-compose now binds Postgres to host port 5434 (not 5432). ' +
        'Copy the new .env.example or update your .env accordingly.',
    );
  });

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, `${PRODUCT.name} API running on http://localhost:${PORT}`);
  // Phase 11.9 — retention scheduler. Opt-in via
  // RETENTION_SCHEDULER_ENABLED=true so dev / test envs do not surprise-
  // purge soft-deleted rows. The first sweep runs on the next tick;
  // subsequent sweeps follow RETENTION_SWEEP_INTERVAL_MS (default 6 h).
  startRetentionScheduler();
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down gracefully');
  stopRetentionScheduler();
  server.close(async () => {
    // Drain Sentry before disconnecting from Postgres — once $disconnect
    // resolves we may be killed at any moment, and queued exception events
    // would otherwise be lost.
    await flushSentry(2000);
    await prisma.$disconnect();
    logger.info('server and db connections closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('force-exit after timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
