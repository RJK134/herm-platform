/**
 * Retention scheduler (Phase 11.9) — closes the deferred follow-up
 * from PR #50: hard-delete soft-deleted rows once the grace period
 * expires.
 *
 * Why a scheduler
 *   GDPR Article 17 right-to-erasure now soft-deletes the User row
 *   (deletedAt + PII scrub). The row stays put for a short grace
 *   window so an accidental erasure can be reversed by an admin —
 *   without one, an accidental click is unrecoverable until the next
 *   DB backup restore. The scheduler closes the loop: once the grace
 *   window passes, the row is hard-deleted and Prisma's cascade
 *   handles the remaining FK-pointing rows.
 *
 * Configuration
 *   RETENTION_GRACE_DAYS         default 30. The grace window. Rows whose
 *                                 deletedAt is older than this are eligible
 *                                 for hard deletion.
 *   RETENTION_SCHEDULER_ENABLED  default `false`. Switching this to `true`
 *                                 starts the in-process timer at server
 *                                 boot. We require an explicit opt-in so
 *                                 dev / test envs don't surprise-purge data.
 *   RETENTION_SWEEP_INTERVAL_MS  default 6 * 60 * 60 * 1000 (6 h). How
 *                                 often the scheduler runs. The window is
 *                                 days, so a 6-h sweep is fine; the cost
 *                                 of running more often is negligible.
 *   RETENTION_BATCH_SIZE         default 100. How many rows to hard-
 *                                 delete per sweep. Cap so a single sweep
 *                                 doesn't lock the DB for a long time
 *                                 if a backlog accumulates.
 *
 * Manual operation
 *   `npx tsx server/src/scripts/retention-sweep.ts [--dry-run]` runs
 *   one sweep and exits — useful for ad-hoc cleanup or for a CI cron
 *   that prefers an out-of-process sweep.
 */
import prisma from '../../utils/prisma';
import { logger } from '../../lib/logger';

interface SweepStats {
  scanned: number;
  deleted: number;
  cutoff: Date;
}

interface SweepOptions {
  /** Override the grace window for this sweep. Defaults to env. */
  graceDays?: number;
  /** Override the per-sweep cap. Defaults to env. */
  batchSize?: number;
  /** When true, only counts and logs; performs no writes. */
  dryRun?: boolean;
}

const DEFAULT_GRACE_DAYS = 30;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * One pass over `User` rows whose `deletedAt` is older than the grace
 * window. Hard-deletes up to `batchSize` rows; Prisma's cascade
 * handles dependent rows. Returns counts so callers (the cron tick,
 * the manual CLI) can log or assert.
 */
export async function sweepUsers(options: SweepOptions = {}): Promise<SweepStats> {
  const graceDays = options.graceDays ?? readNumberEnv('RETENTION_GRACE_DAYS', DEFAULT_GRACE_DAYS);
  const batchSize = options.batchSize ?? readNumberEnv('RETENTION_BATCH_SIZE', DEFAULT_BATCH_SIZE);
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

  const candidates = await prisma.user.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true, deletedAt: true },
    take: batchSize,
    orderBy: { deletedAt: 'asc' },
  });

  if (candidates.length === 0) {
    return { scanned: 0, deleted: 0, cutoff };
  }

  if (options.dryRun) {
    return { scanned: candidates.length, deleted: 0, cutoff };
  }

  // Hard-delete in one query — the SQL cascade is faster than a
  // per-row loop, and the candidates list is already capped to
  // batchSize so we cannot run away.
  const result = await prisma.user.deleteMany({
    where: { id: { in: candidates.map((c) => c.id) } },
  });

  logger.info(
    {
      scanned: candidates.length,
      deleted: result.count,
      cutoff: cutoff.toISOString(),
    },
    'retention.sweep.users',
  );

  return { scanned: candidates.length, deleted: result.count, cutoff };
}

/**
 * Phase 11.14 — sweep soft-deleted Institutions past the grace window.
 * The cascade controller scrubs PII and stamps `deletedAt` on Users,
 * Subscription, and Institution; the scheduler then hard-deletes the
 * tombstoned rows, letting Prisma's `onDelete: Cascade` FKs propagate
 * to the deeper rows (CapabilityBasket, ProcurementProject, etc.).
 *
 * Order matters: Subscription and User rows are deleted by the
 * Institution cascade once the parent is hard-deleted. We still call
 * `sweepUsers` separately because GDPR-erasure paths can soft-delete a
 * single user without a matching institution-level soft-delete.
 */
export async function sweepInstitutions(options: SweepOptions = {}): Promise<SweepStats> {
  const graceDays = options.graceDays ?? readNumberEnv('RETENTION_GRACE_DAYS', DEFAULT_GRACE_DAYS);
  const batchSize = options.batchSize ?? readNumberEnv('RETENTION_BATCH_SIZE', DEFAULT_BATCH_SIZE);
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

  const candidates = await prisma.institution.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true, deletedAt: true },
    take: batchSize,
    orderBy: { deletedAt: 'asc' },
  });

  if (candidates.length === 0) {
    return { scanned: 0, deleted: 0, cutoff };
  }

  if (options.dryRun) {
    return { scanned: candidates.length, deleted: 0, cutoff };
  }

  const result = await prisma.institution.deleteMany({
    where: { id: { in: candidates.map((c) => c.id) } },
  });

  logger.info(
    {
      scanned: candidates.length,
      deleted: result.count,
      cutoff: cutoff.toISOString(),
    },
    'retention.sweep.institutions',
  );

  return { scanned: candidates.length, deleted: result.count, cutoff };
}

// ── In-process scheduler ───────────────────────────────────────────────────

let intervalHandle: NodeJS.Timeout | null = null;

export function isRetentionSchedulerEnabled(): boolean {
  return process.env['RETENTION_SCHEDULER_ENABLED'] === 'true';
}

/**
 * Start the in-process timer. Idempotent — calling twice is a no-op.
 * Designed to be invoked once from `index.ts` after the HTTP listener
 * binds, so the scheduler never blocks startup.
 */
export function startRetentionScheduler(): void {
  if (intervalHandle) return;
  if (!isRetentionSchedulerEnabled()) {
    logger.info('retention.scheduler: not enabled (set RETENTION_SCHEDULER_ENABLED=true to opt in)');
    return;
  }
  const intervalMs = readNumberEnv('RETENTION_SWEEP_INTERVAL_MS', DEFAULT_INTERVAL_MS);

  // Phase 11.14 follow-up (Bugbot review on PR #76) — guard against
  // overlapping ticks. Each tick now runs TWO sweeps (institutions +
  // users), so a long-running sweep could exceed `intervalMs` and the
  // next setInterval fire would start a second concurrent tick. The
  // result: overlapping `deleteMany` calls, doubled DB load, confusing
  // log lines. The guard skips a fired tick when the previous one is
  // still running (logged at debug), letting the in-flight tick finish
  // before the next one starts.
  let inFlight = false;
  async function tick(): Promise<void> {
    if (inFlight) {
      logger.debug('retention.tick: skipped — previous tick still running');
      return;
    }
    inFlight = true;
    try {
      // Phase 11.14 — sweep institutions FIRST so the cascading hard-
      // delete reaps any User rows that hadn't yet been per-User
      // soft-deleted. Then the user sweep mops up GDPR-individual
      // erasures (which don't touch Institution).
      try {
        await sweepInstitutions();
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          'retention.sweep.institutions.failed',
        );
      }
      try {
        await sweepUsers();
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          'retention.sweep.users.failed',
        );
      }
    } finally {
      inFlight = false;
    }
  }

  // Kick off the first sweep on the next tick so server startup
  // doesn't block on it; subsequent sweeps follow the interval.
  setImmediate(() => {
    void tick();
  });
  intervalHandle = setInterval(() => {
    void tick();
  }, intervalMs);
  // unref so a hung scheduler can never keep the process alive.
  intervalHandle.unref?.();

  logger.info({ intervalMs }, 'retention.scheduler: started');
}

export function stopRetentionScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
