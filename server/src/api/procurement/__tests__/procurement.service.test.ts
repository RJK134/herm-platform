import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvalidTransitionError } from '../../../services/domain/procurement/project-status';

// Mock prisma before importing the service so the service picks up the mock.
vi.mock('../../../utils/prisma', () => {
  const procurementProject = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const shortlistEntry = {
    findUnique: vi.fn(),
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
    // $transaction accepts a tuple of promises OR a callback — we cover
    // the tuple form used by `transitionStatus`.
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
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      id: 'p1',
      status: 'draft',
    } as never);
    vi.mocked(prisma.procurementProject.update).mockResolvedValueOnce({
      id: 'p1',
      status: 'active_review',
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
    // `nextStates(active_review)` advertises the next moves.
    expect(result.nextStates).toContain('shortlist_proposed');
    expect(result.nextStates).toContain('archived');

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

  it('throws InvalidTransitionError on forbidden jump', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      id: 'p1',
      status: 'draft',
    } as never);

    await expect(
      service.transitionStatus('p1', { to: 'recommendation_issued' }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    expect(prisma.procurementProject.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('normalises legacy statuses before validating', async () => {
    // Legacy 'active' projects should be able to move to shortlist_proposed
    // because `active` normalises to `active_review`.
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      id: 'p2',
      status: 'active',
    } as never);
    vi.mocked(prisma.procurementProject.update).mockResolvedValueOnce({
      id: 'p2',
      status: 'shortlist_proposed',
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const result = await service.transitionStatus('p2', { to: 'shortlist_proposed' });
    expect(result.transition.from).toBe('active_review');
    expect(result.transition.to).toBe('shortlist_proposed');
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

  it('returns current + next + history normalised', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      status: 'shortlist_proposed',
    } as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      {
        userId: 'u1',
        createdAt: new Date('2026-01-01'),
        changes: { from: 'draft', to: 'active_review', note: 'start' },
      },
      {
        userId: 'u2',
        createdAt: new Date('2026-01-02'),
        changes: { from: 'active_review', to: 'shortlist_proposed', note: null },
      },
    ] as never);

    const ctx = await service.getStatusContext('p1');
    expect(ctx.current).toBe('shortlist_proposed');
    expect(ctx.next).toContain('shortlist_approved');
    expect(ctx.next).toContain('active_review'); // revise
    expect(ctx.history).toHaveLength(2);
    expect(ctx.history[0]).toMatchObject({
      from: 'draft',
      to: 'active_review',
      note: 'start',
      actorId: 'u1',
    });
  });
});

describe('ProcurementService.decideShortlistEntry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stamps decisionStatus, rationale, decidedBy, decidedAt', async () => {
    vi.mocked(prisma.shortlistEntry.findUnique).mockResolvedValueOnce({
      id: 'e1',
      projectId: 'p1',
      systemId: 's1',
    } as never);
    vi.mocked(prisma.shortlistEntry.update).mockImplementationOnce(async (args: unknown) => {
      // Echo the update data so we can assert on what the service sent.
      return { id: 'e1', ...(args as { data: object }).data } as never;
    });

    const result = await service.decideShortlistEntry(
      'e1',
      { decisionStatus: 'approved', rationale: 'Best HERM coverage' },
      { userId: 'u1', name: 'Alice' },
    );

    expect(result).toMatchObject({
      decisionStatus: 'approved',
      rationale: 'Best HERM coverage',
      decidedBy: 'Alice',
    });
    // decidedAt must be a Date near-now (server-stamped, not client-provided).
    const ts = (result as unknown as { decidedAt: Date }).decidedAt;
    expect(ts).toBeInstanceOf(Date);
    expect(Date.now() - ts.getTime()).toBeLessThan(1000);
  });

  it('rejects invalid decisionStatus at the service boundary', async () => {
    vi.mocked(prisma.shortlistEntry.findUnique).mockResolvedValueOnce({
      id: 'e1',
    } as never);

    await expect(
      service.decideShortlistEntry(
        'e1',
        { decisionStatus: 'weird' as never, rationale: 'x' },
      ),
    ).rejects.toThrow(/decisionStatus must be/);
    expect(prisma.shortlistEntry.update).not.toHaveBeenCalled();
  });

  it('falls back to userId then provided decidedBy when name is absent', async () => {
    vi.mocked(prisma.shortlistEntry.findUnique).mockResolvedValueOnce({ id: 'e1' } as never);
    vi.mocked(prisma.shortlistEntry.update).mockImplementationOnce(
      async (args: unknown) => ({ ...(args as { data: object }).data }) as never,
    );

    const result = await service.decideShortlistEntry(
      'e1',
      { decisionStatus: 'rejected', rationale: 'Missing SSO', decidedBy: 'External reviewer' },
      { userId: 'u9' },
    );
    // `name` absent, `userId` present → decidedBy becomes 'u9'
    expect((result as unknown as { decidedBy: string }).decidedBy).toBe('u9');
  });

  it('throws when the entry does not exist', async () => {
    vi.mocked(prisma.shortlistEntry.findUnique).mockResolvedValueOnce(null);
    await expect(
      service.decideShortlistEntry('missing', {
        decisionStatus: 'approved',
        rationale: 'x',
      }),
    ).rejects.toThrow(/Shortlist entry not found/);
  });
});

describe('ProcurementService.clearShortlistDecision', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resets the decision back to pending and nulls reviewer fields', async () => {
    vi.mocked(prisma.shortlistEntry.findUnique).mockResolvedValueOnce({ id: 'e1' } as never);
    vi.mocked(prisma.shortlistEntry.update).mockImplementationOnce(
      async (args: unknown) => ({ ...(args as { data: object }).data }) as never,
    );

    const result = await service.clearShortlistDecision('e1');
    expect(result).toMatchObject({
      decisionStatus: 'pending',
      rationale: null,
      decidedBy: null,
      decidedAt: null,
    });
  });

  it('throws when the entry does not exist', async () => {
    vi.mocked(prisma.shortlistEntry.findUnique).mockResolvedValueOnce(null);
    await expect(service.clearShortlistDecision('missing')).rejects.toThrow(
      /Shortlist entry not found/,
    );
  });
});
