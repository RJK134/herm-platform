// One-shot bootstrap: applies Prisma migrations to Neon over Neon's
// WebSocket pool (the sandbox blocks raw 5432 TCP, so prisma migrate deploy
// can't run from here). Tracks them in _prisma_migrations exactly as Prisma
// would, so `prisma migrate status` from a normal machine is happy after.

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL missing'); process.exit(1); }

const migrationsDir = new URL('../prisma/migrations/', import.meta.url).pathname;
const dirs = readdirSync(migrationsDir)
  .filter(n => statSync(join(migrationsDir, n)).isDirectory())
  .sort();

const pool = new Pool({ connectionString: url });

const PRISMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                    VARCHAR(36) PRIMARY KEY,
  "checksum"              VARCHAR(64) NOT NULL,
  "finished_at"           TIMESTAMPTZ,
  "migration_name"        VARCHAR(255) NOT NULL,
  "logs"                  TEXT,
  "rolled_back_at"        TIMESTAMPTZ,
  "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
);
`;

async function main() {
  const client = await pool.connect();
  try {
    await client.query(PRISMA_MIGRATIONS_DDL);
    const { rows: existing } = await client.query(
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL',
    );
    const applied = new Set(existing.map(r => r.migration_name));
    console.log(`[setup] ${applied.size}/${dirs.length} migrations already applied`);

    for (const name of dirs) {
      if (applied.has(name)) {
        console.log(`[skip] ${name}`);
        continue;
      }
      const sqlPath = join(migrationsDir, name, 'migration.sql');
      const sql = readFileSync(sqlPath, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const id = randomUUID();
      const startedAt = new Date();

      console.log(`[apply] ${name} (${sql.length} bytes)`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO _prisma_migrations
             (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
           VALUES ($1, $2, now(), $3, NULL, $4, 1)`,
          [id, checksum, name, startedAt],
        );
        await client.query('COMMIT');
        console.log(`[ok]    ${name}`);
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`[fail]  ${name}: ${e.message}`);
        throw e;
      }
    }
    console.log('[setup] all migrations applied');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
