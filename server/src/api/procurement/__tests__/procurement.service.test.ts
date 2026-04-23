import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvalidTransitionError } from '../../../services/domain/procurement/project-status';

// Mock prisma before importing the service so the service picks up the mock.
vi.mock('../../../utils/prisma', () => {
  const procurementProject = {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const shortlistEntry = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const auditLog = {
    create: vi.fn(),
    findMany: vi.fn(),
  };
  const prismaMock = {
    procurementProject,
    shortlistEntry,
    auditLog,
    // `transitionStatus` uses a callback transaction; other callers use
    // the tuple form. Handle both.
    $transaction: vi.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') {
        return (ops as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock);
      }
      return ops;
    }),
  };
  return { default: prismaMock };
});

import { ProcurementService } from '../procurement.service';
import prisma from '../../../utils/prisma';

const service = new ProcurementService();

describe('ProcurementService.transitionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('advances draft → active_review and records an audit entry', async () => {
    // Inside the transaction: read → conditional updateMany → audit → re-read.
    vi.mocked(prisma.procurementProject.findUnique)
      .mockResolvedValueOnce({ id: 'p1', status: 'draft' } as never)
      .mockResolvedValueOnce({ id: 'p1', status: 'active_review' } as never);
    vi.mocked(prisma.procurementProject.updateMany).mockResolvedValueOnce({
      count: 1,
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const result = await service.transitionStatus(
      'p1',
      { to: 'active_review', note: 'kick-off' },
      { userId: 'u1', name: 'Alice' },
    );

    expect(result.transition).toEqual({
      from: 'draft',
      to: 'active_review',
      note: 'kick-off',
    });
    expect(result.nextStates).toContain('shortlist_proposed');
    expect(result.nextStates).toContain('archived');

    // Conditional updateMany must assert the `from` status to guard the
    // TOCTOU race surfaced in Phase 3 review.
    expect(prisma.procurementProject.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'draft' },
      data: { status: 'active_review' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'procurement.project.transition',
        entityType: 'ProcurementProject',
        entityId: 'p1',
        userId: 'u1',
        changes: expect.objectContaining({
          from: 'draft',
          to: 'active_review',
          note: 'kick-off',
          actorName: 'Alice',
        }),
      }),
    });
  });

  it('throws InvalidTransitionError on a lost race (concurrent transition)', async () => {
    // First read returns draft; the conditional update loses the race
    // (count: 0); second read surfaces the winner's state (archived).
    vi.mocked(prisma.procurementProject.findUnique)
      .mockResolvedValueOnce({ id: 'p1', status: 'draft' } as never)
      .mockResolvedValueOnce({ id: 'p1', status: 'archived' } as never);
    vi.mocked(prisma.procurementProject.updateMany).mockResolvedValueOnce({
      count: 0,
    } as never);

    try {
      await service.transitionStatus('p1', { to: 'active_review' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      // The error reports the authoritative current state, not the stale read.
      const e = err as InvalidTransitionError;
      expect(e.from).toBe('archived');
    }
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('throws InvalidTransitionError on forbidden jump', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      id: 'p1',
      status: 'draft',
    } as never);

    await expect(
      service.transitionStatus('p1', { to: 'recommendation_issued' }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    expect(prisma.procurementProject.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('normalises legacy statuses before validating', async () => {
    // Legacy 'active' projects should be able to move to shortlist_proposed
    // because `active` normalises to `active_review`.
    vi.mocked(prisma.procurementProject.findUnique)
      .mockResolvedValueOnce({ id: 'p2', status: 'active' } as never)
      .mockResolvedValueOnce({ id: 'p2', status: 'shortlist_proposed' } as never);
    vi.mocked(prisma.procurementProject.updateMany).mockResolvedValueOnce({
      count: 1,
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const result = await service.transitionStatus('p2', { to: 'shortlist_proposed' });
    expect(result.transition.from).toBe('active_review');
    expect(result.transition.to).toBe('shortlist_proposed');
    // The conditional update must assert against the RAW stored value so
    // the concurrency guard actually matches a row in the DB.
    expect(prisma.procurementProject.updateMany).toHaveBeenCalledWith({
      where: { id: 'p2', status: 'active' },
      data: { status: 'shortlist_proposed' },
    });
  });

  it('throws when the project does not exist', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce(null);
    await expect(
      service.transitionStatus('missing', { to: 'active_review' }),
    ).rejects.toThrow(/Project not found/);
  });
});

describe('ProcurementService.getStatusContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns current + next + history with actorId AND actorName', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      status: 'shortlist_proposed',
    } as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      {
        userId: 'u1',
        createdAt: new Date('2026-01-01'),
        changes: {
          from: 'draft',
          to: 'active_review',
          note: 'start',
          actorName: 'Alice',
        },
      },
      {
        userId: 'u2',
        createdAt: new Date('2026-01-02'),
        changes: {
          from: 'active_review',
          to: 'shortlist_proposed',
          note: null,
          actorName: 'Bob',
        },
      },
    ] as never);

    // Authenticated callers get the full history including reviewer PII.
    const ctx = await service.getStatusContext('p1', { includeActor: true });
    expect(ctx.current).toBe('shortlist_proposed');
    expect(ctx.next).toContain('shortlist_approved');
    expect(ctx.next).toContain('active_review'); // revise
    expect(ctx.history).toHaveLength(2);
    expect(ctx.history[0]).toMatchObject({
      from: 'draft',
      to: 'active_review',
      note: 'start',
      actorId: 'u1',
      actorName: 'Alice',
    });
    expect(ctx.history[1]).toMatchObject({ actorId: 'u2', actorName: 'Bob' });
  });

  it('scrubs actorId + actorName for unauthenticated callers', async () => {
    // BugBot-reported PII leak: the anonymous GET /projects/:id/status
    // surface must not expose reviewer CUIDs or display names.
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      status: 'shortlist_proposed',
    } as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      {
        userId: 'u1',
        createdAt: new Date('2026-01-01'),
        changes: {
          from: 'draft',
          to: 'active_review',
          note: 'start',
          actorName: 'Alice',
        },
      },
    ] as never);

    const ctx = await service.getStatusContext('p1');
    expect(ctx.history[0]).toMatchObject({
      from: 'draft',
      to: 'active_review',
      note: 'start',
      actorId: null,
      actorName: null,
    });
  });

  it('tolerates legacy audit rows missing actorName', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      status: 'draft',
    } as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      {
        userId: null,
        createdAt: new Date('2026-01-01'),
        changes: { from: 'draft', to: 'active_review' },
      },
    ] as never);
    const ctx = await service.getStatusContext('p1', { includeActor: true });
    expect(ctx.history[0]).toMatchObject({ actorId: null, actorName: null });
  });
});

describe('ProcurementService.getShortlist — governance scrub', () => {
  beforeEach(() => vi.clearAllMocks());

  const baseEntry = {
    id: 'e1',
    projectId: 'p1',
    systemId: 's1',
    status: 'shortlist',
    score: 82,
    notes: null,
    addedAt: new Date('2026-02-01'),
    decisionStatus: 'approved',
    rationale: 'Best HERM coverage',
    decidedBy: 'Alice',
    decidedAt: new Date('2026-02-05'),
    system: { id: 's1', name: 'Sys', vendor: 'Ven', category: 'SIS' },
  };

  it('scrubs decidedBy + rationale for unauthenticated callers', async () => {
    vi.mocked(prisma.shortlistEntry.findMany).mockResolvedValueOnce([
      baseEntry,
    ] as never);
    const [entry] = (await service.getShortlist('p1')) as unknown as Array<
      typeof baseEntry
    >;
    expect(entry.decidedBy).toBeNull();
    expect(entry.rationale).toBeNull();
    // State + timestamp stay — they're not PII.
    expect(entry.decisionStatus).toBe('approved');
    expect(entry.decidedAt).toBeInstanceOf(Date);
  });

  it('returns full governance for authenticated callers', async () => {
    vi.mocked(prisma.shortlistEntry.findMany).mockResolvedValueOnce([
      baseEntry,
    ] as never);
    const [entry] = (await service.getShortlist('p1', {
      includeGovernance: true,
    })) as unknown as Array<typeof baseEntry>;
    expect(entry.decidedBy).toBe('Alice');
    expect(entry.rationale).toBe('Best HERM coverage');
  });
});

describe('ProcurementService.decideShortlistEntry — tenant scoping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stamps decisionStatus, rationale, decidedBy, decidedAt', async () => {
    vi.mocked(prisma.shortlistEntry.findFirst).mockResolvedValueOnce({
      id: 'e1',
      projectId: 'p1',
      systemId: 's1',
    } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.shortlistEntry.update as any).mockImplementationOnce((args: { data: object }) =>
      Promise.resolve({ id: 'e1', ...args.data }),
    );

    const result = await service.decideShortlistEntry(
      'p1',
      'e1',
      { decisionStatus: 'approved', rationale: 'Best HERM coverage' },
      { userId: 'u1', name: 'Alice' },
    );

    // findFirst must filter on BOTH id AND projectId — this is the
    // tenant-isolation contract.
    expect(prisma.shortlistEntry.findFirst).toHaveBeenCalledWith({
      where: { id: 'e1', projectId: 'p1' },
    });

    expect(result).toMatchObject({
      decisionStatus: 'approved',
      rationale: 'Best HERM coverage',
      decidedBy: 'Alice',
    });
    const ts = (result as unknown as { decidedAt: Date }).decidedAt;
    expect(ts).toBeInstanceOf(Date);
    expect(Date.now() - ts.getTime()).toBeLessThan(1000);
  });

  it('rejects the decision if the entry belongs to a different project', async () => {
    // Entry exists but not under the provided projectId → findFirst returns null.
    vi.mocked(prisma.shortlistEntry.findFirst).mockResolvedValueOnce(null);

    await expect(
      service.decideShortlistEntry('wrong-project', 'e1', {
        decisionStatus: 'approved',
        rationale: 'x',
      }),
    ).rejects.toThrow(/Shortlist entry not found/);

    expect(prisma.shortlistEntry.update).not.toHaveBeenCalled();
  });

  it('rejects invalid decisionStatus at the service boundary', async () => {
    vi.mocked(prisma.shortlistEntry.findFirst).mockResolvedValueOnce({
      id: 'e1',
    } as never);

    await expect(
      service.decideShortlistEntry('p1', 'e1', {
        decisionStatus: 'weird' as never,
        rationale: 'x',
      }),
    ).rejects.toThrow(/decisionStatus must be/);
    expect(prisma.shortlistEntry.update).not.toHaveBeenCalled();
  });

  it('falls back to userId when the JWT name is absent', async () => {
    vi.mocked(prisma.shortlistEntry.findFirst).mockResolvedValueOnce({ id: 'e1' } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.shortlistEntry.update as any).mockImplementationOnce((args: { data: object }) =>
      Promise.resolve({ ...args.data }),
    );

    const result = await service.decideShortlistEntry(
      'p1',
      'e1',
      { decisionStatus: 'rejected', rationale: 'Missing SSO' },
      { userId: 'u9' },
    );
    // JWT `name` absent → `userId` is the fallback.
    expect((result as unknown as { decidedBy: string }).decidedBy).toBe('u9');
  });

  it('rejects empty-string JWT names and falls through to userId', async () => {
    // A malformed JWT with `name: ''` must NOT produce an empty
    // `decidedBy` — that would silently store unattributed decisions.
    vi.mocked(prisma.shortlistEntry.findFirst).mockResolvedValueOnce({ id: 'e1' } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.shortlistEntry.update as any).mockImplementationOnce((args: { data: object }) =>
      Promise.resolve({ ...args.data }),
    );
    const result = await service.decideShortlistEntry(
      'p1',
      'e1',
      { decisionStatus: 'approved', rationale: 'Meets requirements' },
      { userId: 'u9', name: '   ' },
    );
    expect((result as unknown as { decidedBy: string }).decidedBy).toBe('u9');
  });

  it('trims whitespace from JWT names before storing', async () => {
    vi.mocked(prisma.shortlistEntry.findFirst).mockResolvedValueOnce({ id: 'e1' } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.shortlistEntry.update as any).mockImplementationOnce((args: { data: object }) =>
      Promise.resolve({ ...args.data }),
    );
    const result = await service.decideShortlistEntry(
      'p1',
      'e1',
      { decisionStatus: 'approved', rationale: 'Best fit' },
      { userId: 'u9', name: '  Alice  ' },
    );
    expect((result as unknown as { decidedBy: string }).decidedBy).toBe('Alice');
  });
});

describe('ProcurementService.clearShortlistDecision — tenant scoping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resets the decision back to pending and nulls reviewer fields', async () => {
    vi.mocked(prisma.shortlistEntry.findFirst).mockResolvedValueOnce({ id: 'e1' } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.shortlistEntry.update as any).mockImplementationOnce((args: { data: object }) =>
      Promise.resolve({ ...args.data }),
    );

    const result = await service.clearShortlistDecision('p1', 'e1');
    expect(prisma.shortlistEntry.findFirst).toHaveBeenCalledWith({
      where: { id: 'e1', projectId: 'p1' },
    });
    expect(result).toMatchObject({
      decisionStatus: 'pending',
      rationale: null,
      decidedBy: null,
      decidedAt: null,
    });
  });

  it('rejects the clear if the entry belongs to a different project', async () => {
    vi.mocked(prisma.shortlistEntry.findFirst).mockResolvedValueOnce(null);
    await expect(
      service.clearShortlistDecision('wrong-project', 'e1'),
    ).rejects.toThrow(/Shortlist entry not found/);
    expect(prisma.shortlistEntry.update).not.toHaveBeenCalled();
  });
});
