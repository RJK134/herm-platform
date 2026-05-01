#!/usr/bin/env node
/**
 * One-shot UKAMF cert rotation. Useful for ad-hoc cleanup or for an
 * out-of-process cron that prefers to drive the sweep externally.
 *
 *   npx tsx server/src/scripts/ukamf-rotate.ts [--dry-run]
 *
 * Reads the same env vars as the in-process scheduler:
 *   UKAMF_METADATA_URL    required
 *   UKAMF_FETCH_TIMEOUT_MS  optional; default 30 s
 *
 * Exits 0 on success (regardless of how many rows rotated), 1 on a
 * fetch / parse / DB error counted in the stats.
 */
import prisma from '../utils/prisma';
import { rotateOnce } from '../services/sso/ukamf-cert-rotation';

async function main(): Promise<number> {
  const dryRun = process.argv.includes('--dry-run');
  const stats = await rotateOnce({ dryRun });
  process.stdout.write(
    `ukamf rotate: scanned=${stats.scanned} rotated=${stats.rotated} skipped=${stats.skipped} errors=${stats.errors}${
      dryRun ? ' (dry-run)' : ''
    }\n`,
  );
  return stats.errors > 0 ? 1 : 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    process.stderr.write(`ukamf rotate failed: ${err instanceof Error ? err.message : String(err)}\n`);
    await prisma.$disconnect();
    process.exit(1);
  });
