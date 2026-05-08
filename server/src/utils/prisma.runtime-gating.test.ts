import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockPrismaClient {
  static instances: MockPrismaClient[] = [];
  readonly options: unknown;

  constructor(options?: unknown) {
    this.options = options;
    MockPrismaClient.instances.push(this);
  }
}

vi.mock('@prisma/client', () => ({
  PrismaClient: MockPrismaClient,
}));

const ORIGINAL_ENV = process.env;

describe('prisma runtime env gating', () => {
  beforeEach(() => {
    vi.resetModules();
    MockPrismaClient.instances = [];
    process.env = { ...ORIGINAL_ENV };
    delete process.env['PRISMA_NEON_HTTP'];
    delete process.env['USE_NEON_HTTP'];
    delete process.env['DATABASE_URL'];
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('throws a clear error when PRISMA_NEON_HTTP=1 and DATABASE_URL is missing', async () => {
    process.env['PRISMA_NEON_HTTP'] = '1';

    await expect(import('./prisma')).rejects.toThrow(
      'PRISMA_NEON_HTTP=1 requires DATABASE_URL to be set',
    );
  });

  it('uses datasource URL defaults when Neon runtime flag is unset', async () => {
    process.env['DATABASE_URL'] = 'postgresql://user:pass@host:5432/db';

    await import('./prisma');

    expect(MockPrismaClient.instances).toHaveLength(1);
    const client = MockPrismaClient.instances[0];
    expect(client.options).toEqual({
      datasources: {
        db: {
          url: expect.stringContaining('connection_limit=10'),
        },
      },
    });
    expect((client.options as { datasources: { db: { url: string } } }).datasources.db.url).toContain(
      'options=-c%20statement_timeout%3D15000',
    );
  });
});
