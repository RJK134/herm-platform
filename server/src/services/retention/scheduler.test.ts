/**
 * Phase 11.9 — retention scheduler tests.
 *
 * The Prisma client is mocked. The unit under test is the SQL-shape
 * the scheduler asks for — particularly the `where: { deletedAt: { lt: cutoff } }`
 * filter — and the off-by-one we'd most likely regress (live row picked
 * up by the sweep, fresh soft-delete swept before its grace ends, etc.).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findManyMock, deleteManyMock, instFindManyMock, instDeleteManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  deleteManyMock: vi.fn(),
  instFindManyMock: vi.fn(),
  instDeleteManyMock: vi.fn(),
}));
vi.mock('../../utils/prisma', () => ({
  default: {
    user: {
      findMany: findManyMock,
      deleteMany: deleteManyMock,
    },
    institution: {
      findMany: instFindManyMock,
      deleteMany: instDeleteManyMock,
    },
  },
}));

vi.mock('../../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sweepUsers, sweepInstitutions, isRetentionSchedulerEnabled } from './scheduler';

beforeEach(() => {
  findManyMock.mockReset();
  deleteManyMock.mockReset();
  instFindManyMock.mockReset();
  instDeleteManyMock.mockReset();
});

describe('sweepUsers', () => {
  it('queries User.findMany with deletedAt < cutoff (graceDays days ago)', async () => {
    findManyMock.mockResolvedValue([]);
    const before = Date.now();
    await sweepUsers({ graceDays: 30, batchSize: 50 });
    const after = Date.now();

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const args = findManyMock.mock.calls[0]?.[0] as {
      where: { deletedAt: { not: null; lt: Date } };
      take: number;
      orderBy: { deletedAt: 'asc' };
    };
    expect(args.take).toBe(50);
    expect(args.orderBy).toEqual({ deletedAt: 'asc' });

    // Cutoff must be ~30 days before "now" — bracketed by the test's
    // wall-clock window. Tolerance is generous (60 s) so test runs on
    // slow CI agents don't flake.
    const expectedMin = new Date(before - 30 * 24 * 60 * 60 * 1000 - 60_000);
    const expectedMax = new Date(after - 30 * 24 * 60 * 60 * 1000 + 60_000);
    expect(args.where.deletedAt.lt.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
    expect(args.where.deletedAt.lt.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
    expect(args.where.deletedAt.not).toBeNull();
  });

  it('returns scanned=0, deleted=0 when no rows are eligible', async () => {
    findManyMock.mockResolvedValue([]);
    const stats = await sweepUsers();
    expect(stats.scanned).toBe(0);
    expect(stats.deleted).toBe(0);
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  it('hard-deletes the candidates returned by findMany', async () => {
    findManyMock.mockResolvedValue([
      { id: 'u-1', deletedAt: new Date('2026-01-01T00:00:00Z') },
      { id: 'u-2', deletedAt: new Date('2026-01-02T00:00:00Z') },
      { id: 'u-3', deletedAt: new Date('2026-01-03T00:00:00Z') },
    ]);
    deleteManyMock.mockResolvedValue({ count: 3 });

    const stats = await sweepUsers();
    expect(stats.scanned).toBe(3);
    expect(stats.deleted).toBe(3);
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { id: { in: ['u-1', 'u-2', 'u-3'] } },
    });
  });

  it('--dry-run reports the would-be count and performs no delete', async () => {
    findManyMock.mockResolvedValue([
      { id: 'u-a', deletedAt: new Date('2026-01-01T00:00:00Z') },
      { id: 'u-b', deletedAt: new Date('2026-01-02T00:00:00Z') },
    ]);
    const stats = await sweepUsers({ dryRun: true });
    expect(stats.scanned).toBe(2);
    expect(stats.deleted).toBe(0);
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  it('caps scanning at the batchSize so a backlog cannot lock the DB', async () => {
    findManyMock.mockResolvedValue([]);
    await sweepUsers({ batchSize: 7 });
    const args = findManyMock.mock.calls[0]?.[0] as { take: number };
    expect(args.take).toBe(7);
  });
});

describe('sweepInstitutions (Phase 11.14)', () => {
  it('queries Institution.findMany with deletedAt < cutoff (graceDays days ago)', async () => {
    instFindManyMock.mockResolvedValue([]);
    const before = Date.now();
    await sweepInstitutions({ graceDays: 30, batchSize: 50 });
    const after = Date.now();
    const args = instFindManyMock.mock.calls[0]?.[0] as {
      where: { deletedAt: { not: null; lt: Date } };
      take: number;
    };
    expect(args.where.deletedAt.lt).toBeInstanceOf(Date);
    const cutoffMs = args.where.deletedAt.lt.getTime();
    const expectedMin = before - 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 30 * 24 * 60 * 60 * 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
    expect(args.take).toBe(50);
  });

  it('returns zero stats and skips deleteMany when no candidates match', async () => {
    instFindManyMock.mockResolvedValue([]);
    const stats = await sweepInstitutions();
    expect(stats.scanned).toBe(0);
    expect(stats.deleted).toBe(0);
    expect(instDeleteManyMock).not.toHaveBeenCalled();
  });

  it('hard-deletes institutions whose deletedAt is older than the cutoff', async () => {
    instFindManyMock.mockResolvedValue([
      { id: 'inst-a', deletedAt: new Date('2026-01-01') },
      { id: 'inst-b', deletedAt: new Date('2026-01-02') },
    ]);
    instDeleteManyMock.mockResolvedValue({ count: 2 });
    const stats = await sweepInstitutions();
    expect(stats.scanned).toBe(2);
    expect(stats.deleted).toBe(2);
    expect(instDeleteManyMock).toHaveBeenCalledWith({
      where: { id: { in: ['inst-a', 'inst-b'] } },
    });
  });

  it('dry-run scans candidates but performs no deletes', async () => {
    instFindManyMock.mockResolvedValue([{ id: 'inst-a', deletedAt: new Date('2026-01-01') }]);
    const stats = await sweepInstitutions({ dryRun: true });
    expect(stats.scanned).toBe(1);
    expect(stats.deleted).toBe(0);
    expect(instDeleteManyMock).not.toHaveBeenCalled();
  });

  it('honours batchSize via the take parameter', async () => {
    instFindManyMock.mockResolvedValue([]);
    await sweepInstitutions({ batchSize: 7 });
    const args = instFindManyMock.mock.calls[0]?.[0] as { take: number };
    expect(args.take).toBe(7);
  });
});

describe('isRetentionSchedulerEnabled', () => {
  it('respects RETENTION_SCHEDULER_ENABLED=true', () => {
    const original = process.env['RETENTION_SCHEDULER_ENABLED'];
    process.env['RETENTION_SCHEDULER_ENABLED'] = 'true';
    expect(isRetentionSchedulerEnabled()).toBe(true);
    process.env['RETENTION_SCHEDULER_ENABLED'] = 'false';
    expect(isRetentionSchedulerEnabled()).toBe(false);
    delete process.env['RETENTION_SCHEDULER_ENABLED'];
    expect(isRetentionSchedulerEnabled()).toBe(false);
    if (original === undefined) delete process.env['RETENTION_SCHEDULER_ENABLED'];
    else process.env['RETENTION_SCHEDULER_ENABLED'] = original;
  });
});
