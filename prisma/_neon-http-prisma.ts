import { PrismaClient } from '@prisma/client';

/**
 * Returns a PrismaClient. When USE_NEON_HTTP=1 is set, routes queries
 * through Neon's WebSocket transport (works over outbound HTTPS only).
 * Otherwise behaves identically to `new PrismaClient()`.
 *
 * Use this in any seed/script that must run in environments where raw
 * Postgres TCP (port 5432) is blocked.
 */
export async function getPrismaClient(): Promise<PrismaClient> {
  if (process.env['USE_NEON_HTTP'] !== '1') {
    return new PrismaClient();
  }

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required when USE_NEON_HTTP is enabled.');
  }

  const [{ Pool, neonConfig }, { PrismaNeon }, wsMod] = await Promise.all([
    import('@neondatabase/serverless'),
    import('@prisma/adapter-neon'),
    import('ws'),
  ]);
  neonConfig.webSocketConstructor = wsMod.default;
  const pool = new Pool({ connectionString: databaseUrl });
  return new PrismaClient({ adapter: new PrismaNeon(pool) });
}
