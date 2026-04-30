/**
 * Manual retention sweep — runs one pass and exits.
 *
 * Why a CLI in addition to the in-process scheduler:
 *   1. Out-of-process cron schedulers (Kubernetes CronJob, GitHub
 *      Actions, etc.) prefer to drive the sweep externally so the
 *      app pods can stay stateless.
 *   2. Operators occasionally want to sweep on demand (after a bulk
 *      erasure, before a backup, when triaging a backlog) without
 *      restarting the server.
 *   3. The `--dry-run` mode is useful for "show me how many rows are
 *      about to be hard-deleted before I commit".
 *
 * Usage
 *   npx tsx server/src/scripts/retention-sweep.ts [--dry-run] [--grace-days=N] [--batch=N]
 *   npm run db:retention-sweep              # alias of the above
 *
 * Exits 0 on success, 1 on failure.
 */
import { sweepUsers } from '../services/retention/scheduler';

interface ParsedArgs {
  dryRun: boolean;
  graceDays?: number;
  batchSize?: number;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const out: ParsedArgs = { dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--grace-days=')) {
      const n = Number.parseInt(a.slice('--grace-days='.length), 10);
      if (Number.isFinite(n) && n > 0) out.graceDays = n;
    } else if (a.startsWith('--batch=')) {
      const n = Number.parseInt(a.slice('--batch='.length), 10);
      if (Number.isFinite(n) && n > 0) out.batchSize = n;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // eslint-disable-next-line no-console
  console.log(
    `\nretention-sweep — ${args.dryRun ? 'DRY RUN (no writes)' : 'LIVE'}` +
      (args.graceDays ? ` graceDays=${args.graceDays}` : '') +
      (args.batchSize ? ` batchSize=${args.batchSize}` : '') +
      '\n',
  );
  const stats = await sweepUsers(args);
  // eslint-disable-next-line no-console
  console.log(
    `Done.\n` +
      `  cutoff           ${stats.cutoff.toISOString()}\n` +
      `  rows scanned     ${stats.scanned}\n` +
      `  rows ${args.dryRun ? 'would be ' : ''}deleted     ${stats.deleted}\n`,
  );
}

declare const require: { main?: unknown } | undefined;
declare const module: unknown;
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
