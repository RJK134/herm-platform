import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvalidTransitionError } from '../../../services/domain/procurement/project-status';

// Mock prisma before importing the service so the service picks up the mock.
vi.mock('../../../utils/prisma', () => {
  const procurementProject = {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const procurementWorkflow = {
    create: vi.fn(),
    findUnique: vi.fn(),
  };
  const procurementStage = {
    create: vi.fn(),
  };
  const stageTask = {
    createMany: vi.fn(),
  };
  const institution = {
    findFirst: vi.fn(),
    create: vi.fn(),
  };
  const capabilityBasket = {
    findUnique: vi.fn(),
  };
  const vendorSystem = {
    findMany: vi.fn(),
  };
  const capabilityScore = {
    findMany: vi.fn(),
  };
  const shortlistEntry = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  };
  const auditLog = {
    create: vi.fn(),
    findMany: vi.fn(),
  };
  const prismaMock = {
    institution,
    procurementProject,
    procurementWorkflow,
    procurementStage,
    stageTask,
    capabilityBasket,
    vendorSystem,
    capabilityScore,
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

// Phase 4: `seedShortlistFromBasket` delegates to `BasketsService.evaluateBasket`.
// Mock it so the tests don't have to stub three layers of prisma (basket +
// its items + capability scores + vendor systems) just to assert the seed
// shape.
const mockEvaluateBasket = vi.fn();
vi.mock('../../baskets/baskets.service', () => ({
  // `new BasketsService()` in the service under test must return an
  // instance with `evaluateBasket`, so the mock has to be a real class
  // — `vi.fn().mockImplementation(() => obj)` isn't a constructor.
  BasketsService: class {
    evaluateBasket = mockEvaluateBasket;
  },
}));

import { ProcurementService } from '../procurement.service';
import { procurementEngine } from '../../../services/domain/procurement-engine';
import prisma from '../../../utils/prisma';

const service = new ProcurementService();

describe('ProcurementService.createProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists procurement stages and tasks alongside the legacy workflow', async () => {
    const stageDefs = procurementEngine.getStageDefinitions('UK');
    expect(stageDefs.length).toBeGreaterThan(0);

    vi.mocked(prisma.procurementProject.create).mockResolvedValueOnce({
      id: 'project-1',
      name: 'New Project',
      institutionId: 'inst-1',
      jurisdiction: 'UK',
      basketId: null,
      status: 'draft',
    } as never);
    vi.mocked(prisma.procurementWorkflow.create).mockResolvedValueOnce({
      id: 'workflow-1',
      projectId: 'project-1',
    } as never);
    vi.mocked(prisma.procurementStage.create).mockImplementation(({ data }) =>
      Promise.resolve({ id: `stage-${data.stageCode}`, ...data }) as never,
    );
    vi.mocked(prisma.stageTask.createMany).mockResolvedValue({ count: 1 } as never);

    const project = await service.createProject({
      name: 'New Project',
      institutionId: 'inst-1',
      jurisdiction: 'UK',
    });

    expect(project).toMatchObject({
      id: 'project-1',
      institutionId: 'inst-1',
      jurisdiction: 'UK',
      status: 'draft',
    });

    expect(prisma.procurementProject.create).toHaveBeenCalledWith({
      data: {
        name: 'New Project',
        institutionId: 'inst-1',
        jurisdiction: 'UK',
        basketId: null,
        status: 'draft',
      },
    });

    expect(prisma.procurementWorkflow.create).toHaveBeenCalledWith({
      data: {
        projectId: 'project-1',
        currentStage: 1,
        stages: {
          create: expect.arrayContaining([
            expect.objectContaining({
              stageNumber: 1,
              title: 'Requirements Definition',
              status: 'active',
            }),
            expect.objectContaining({
              stageNumber: 8,
              title: 'Contract Award',
              status: 'pending',
            }),
          ]),
        },
      },
    });

    expect(prisma.procurementStage.create).toHaveBeenCalledTimes(stageDefs.length);
    expect(prisma.procurementStage.create).toHaveBeenNthCalledWith(1, {
      data: {
        projectId: 'project-1',
        stageCode: stageDefs[0].stageCode,
        stageName: stageDefs[0].stageName,
        stageOrder: stageDefs[0].stageOrder,
        status: 'IN_PROGRESS',
        complianceChecks: stageDefs[0].complianceCheckCodes,
      },
    });
    expect(prisma.procurementStage.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        projectId: 'project-1',
        stageCode: stageDefs[1].stageCode,
        stageName: stageDefs[1].stageName,
        stageOrder: stageDefs[1].stageOrder,
        status: 'NOT_STARTED',
        complianceChecks: stageDefs[1].complianceCheckCodes,
      }),
    });

    expect(prisma.stageTask.createMany).toHaveBeenCalledTimes(stageDefs.length);
    expect(prisma.stageTask.createMany).toHaveBeenNthCalledWith(1, {
      data: stageDefs[0].tasks.map((task) => ({
        stageId: `stage-${stageDefs[0].stageCode}`,
        title: task.title,
        description: task.description ?? null,
        isMandatory: task.isMandatory,
        sortOrder: task.sortOrder,
      })),
    });
    const lastStageDef = stageDefs.at(-1);
    expect(lastStageDef).toBeDefined();
    expect(prisma.stageTask.createMany).toHaveBeenLastCalledWith({
      data: lastStageDef!.tasks.map((task) => ({
        stageId: `stage-${lastStageDef!.stageCode}`,
        title: task.title,
        description: task.description ?? null,
        isMandatory: task.isMandatory,
        sortOrder: task.sortOrder,
      })),
    });
  });
});

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

  it('throws NotFoundError when the race loser finds the row deleted', async () => {
    // Concurrent delete: initial read succeeds, updateMany flips nothing,
    // second read returns null. Previously this surfaced a misleading
    // "cannot transition from 'draft' to …" InvalidTransitionError;
    // now it correctly reports the project is gone.
    vi.mocked(prisma.procurementProject.findUnique)
      .mockResolvedValueOnce({ id: 'p1', status: 'draft' } as never)
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.procurementProject.updateMany).mockResolvedValueOnce({
      count: 0,
    } as never);

    await expect(
      service.transitionStatus('p1', { to: 'active_review' }),
    ).rejects.toThrow(/Project not found/);
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

describe('ProcurementService basket shortlist integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns shortlist systems for evaluation dropdowns', async () => {
    vi.mocked(prisma.shortlistEntry.findMany).mockResolvedValueOnce([
      {
        id: 'entry-1',
        status: 'shortlist',
        score: 91.2,
        addedAt: new Date('2026-02-01'),
        system: { id: 'sys-1', name: 'Alpha SIS', vendor: 'Alpha', category: 'SIS' },
      },
    ] as never);

    await expect(service.getShortlistSystems('p1')).resolves.toEqual([
      {
        id: 'sys-1',
        name: 'Alpha SIS',
        vendor: 'Alpha',
        category: 'SIS',
        status: 'shortlist',
        score: 91.2,
        shortlistEntryId: 'entry-1',
      },
    ]);
  });

  it('imports the top basket-ranked systems into the shortlist and promotes longlist entries', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      id: 'p1',
      basketId: 'basket-1',
    } as never);
    vi.mocked(prisma.capabilityBasket.findUnique).mockResolvedValueOnce({
      id: 'basket-1',
      frameworkId: null,
      items: [
        { capabilityId: 'cap-1', priority: 'must', weight: 2 },
        { capabilityId: 'cap-2', priority: 'should', weight: 1 },
      ],
    } as never);
    vi.mocked(prisma.vendorSystem.findMany).mockResolvedValueOnce([
      { id: 'sys-1' },
      { id: 'sys-2' },
      { id: 'sys-3' },
    ] as never);
    vi.mocked(prisma.capabilityScore.findMany).mockResolvedValueOnce([
      { systemId: 'sys-1', capabilityId: 'cap-1', value: 95 },
      { systemId: 'sys-1', capabilityId: 'cap-2', value: 90 },
      { systemId: 'sys-2', capabilityId: 'cap-1', value: 88 },
      { systemId: 'sys-2', capabilityId: 'cap-2', value: 72 },
      { systemId: 'sys-3', capabilityId: 'cap-1', value: 20 },
      { systemId: 'sys-3', capabilityId: 'cap-2', value: 10 },
    ] as never);
    vi.mocked(prisma.shortlistEntry.findMany)
      .mockResolvedValueOnce([
        { id: 'existing-1', systemId: 'sys-2', status: 'longlist', score: null },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'entry-1',
          projectId: 'p1',
          systemId: 'sys-1',
          status: 'shortlist',
          score: 93.8,
          addedAt: new Date('2026-02-01'),
          system: { id: 'sys-1', name: 'Alpha SIS', vendor: 'Alpha', category: 'SIS' },
        },
        {
          id: 'entry-2',
          projectId: 'p1',
          systemId: 'sys-2',
          status: 'shortlist',
          score: 82.7,
          addedAt: new Date('2026-02-01'),
          system: { id: 'sys-2', name: 'Beta LMS', vendor: 'Beta', category: 'LMS' },
        },
      ] as never);
    vi.mocked(prisma.shortlistEntry.create).mockResolvedValueOnce({ id: 'entry-1' } as never);
    vi.mocked(prisma.shortlistEntry.update).mockResolvedValueOnce({ id: 'existing-1' } as never);

    const result = await service.importBasketToShortlist('p1', { limit: 2 });

    expect(prisma.shortlistEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'p1',
        systemId: 'sys-1',
        status: 'shortlist',
      }),
    });
    expect(prisma.shortlistEntry.update).toHaveBeenCalledWith({
      where: { id: 'existing-1' },
      data: { status: 'shortlist', score: expect.any(Number) },
    });
    expect(result.importedCount).toBe(1);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({ id: 'sys-1', name: 'Alpha SIS' });
  });

  it('rejects imports when the project has no linked basket', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      id: 'p1',
      basketId: null,
    } as never);

    await expect(service.importBasketToShortlist('p1')).rejects.toThrow(
      /linked capability basket/,
    );

    expect(prisma.capabilityBasket.findUnique).not.toHaveBeenCalled();
    expect(prisma.shortlistEntry.create).not.toHaveBeenCalled();
  });
});

describe('ProcurementService.decideShortlistEntry — tenant scoping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stamps decisionStatus, rationale, decidedBy, decidedAt', async () => {
    vi.mocked(prisma.shortlistEntry.findFirst).mockResolvedValueOnce({
      id: 'e1',
      projectId: 'p1',
      systemId: 's1',
      decisionStatus: 'pending',
      rationale: null,
      decidedBy: null,
      decidedAt: null,
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
    // Validation happens BEFORE findFirst now (cheap guard before the
    // transaction) so we don't queue a findFirst return here — doing so
    // would leak into the next test's mockResolvedValueOnce queue.
    await expect(
      service.decideShortlistEntry('p1', 'e1', {
        decisionStatus: 'weird' as never,
        rationale: 'x',
      }),
    ).rejects.toThrow(/decisionStatus must be/);
    expect(prisma.shortlistEntry.findFirst).not.toHaveBeenCalled();
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

  it('writes an AuditLog entry capturing previous + next decision state', async () => {
    // The previous decision (stored on the row before we overwrite it)
    // must survive in AuditLog.changes.previous so governance history
    // isn't lost when someone re-decides or clears.
    const priorDecidedAt = new Date('2026-03-01T10:00:00Z');
    vi.mocked(prisma.shortlistEntry.findFirst).mockResolvedValueOnce({
      id: 'e1',
      projectId: 'p1',
      systemId: 's1',
      decisionStatus: 'rejected',
      rationale: 'Missing SSO',
      decidedBy: 'Alice',
      decidedAt: priorDecidedAt,
    } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.shortlistEntry.update as any).mockImplementationOnce((args: { data: object }) =>
      Promise.resolve({ ...args.data }),
    );
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    await service.decideShortlistEntry(
      'p1',
      'e1',
      { decisionStatus: 'approved', rationale: 'SSO available after all' },
      { userId: 'u2', name: 'Bob' },
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'procurement.shortlist.decision',
        entityType: 'ShortlistEntry',
        entityId: 'e1',
        userId: 'u2',
        changes: expect.objectContaining({
          projectId: 'p1',
          systemId: 's1',
          previous: expect.objectContaining({
            decisionStatus: 'rejected',
            rationale: 'Missing SSO',
            decidedBy: 'Alice',
            decidedAt: priorDecidedAt.toISOString(),
          }),
          next: expect.objectContaining({
            decisionStatus: 'approved',
            rationale: 'SSO available after all',
            decidedBy: 'Bob',
          }),
          actorName: 'Bob',
        }),
      }),
    });
  });
});

describe('ProcurementService.clearShortlistDecision — tenant scoping + audit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resets the decision back to pending and nulls reviewer fields', async () => {
    vi.mocked(prisma.shortlistEntry.findFirst).mockResolvedValueOnce({
      id: 'e1',
      projectId: 'p1',
      systemId: 's1',
      decisionStatus: 'approved',
      rationale: 'X',
      decidedBy: 'Alice',
      decidedAt: new Date(),
    } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.shortlistEntry.update as any).mockImplementationOnce((args: { data: object }) =>
      Promise.resolve({ ...args.data }),
    );
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const result = await service.clearShortlistDecision('p1', 'e1', {
      userId: 'u2',
      name: 'Bob',
    });
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

  it('writes an AuditLog entry preserving the prior approval before clearing', async () => {
    // Before Phase 3 audit coverage, this sequence silently destroyed
    // the prior approval's reviewer + rationale. Now the AuditLog row
    // carries `previous.*` so the decision history survives the clear.
    const priorDecidedAt = new Date('2026-03-01T10:00:00Z');
    vi.mocked(prisma.shortlistEntry.findFirst).mockResolvedValueOnce({
      id: 'e1',
      projectId: 'p1',
      systemId: 's1',
      decisionStatus: 'approved',
      rationale: 'Best fit',
      decidedBy: 'Alice',
      decidedAt: priorDecidedAt,
    } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.shortlistEntry.update as any).mockImplementationOnce((args: { data: object }) =>
      Promise.resolve({ ...args.data }),
    );
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    await service.clearShortlistDecision('p1', 'e1', {
      userId: 'u2',
      name: 'Bob',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'procurement.shortlist.decision.clear',
        entityType: 'ShortlistEntry',
        entityId: 'e1',
        userId: 'u2',
        changes: expect.objectContaining({
          projectId: 'p1',
          systemId: 's1',
          previous: expect.objectContaining({
            decisionStatus: 'approved',
            rationale: 'Best fit',
            decidedBy: 'Alice',
            decidedAt: priorDecidedAt.toISOString(),
          }),
          actorName: 'Bob',
        }),
      }),
    });
  });

  it('rejects the clear if the entry belongs to a different project', async () => {
    vi.mocked(prisma.shortlistEntry.findFirst).mockResolvedValueOnce(null);
    await expect(
      service.clearShortlistDecision('wrong-project', 'e1'),
    ).rejects.toThrow(/Shortlist entry not found/);
    expect(prisma.shortlistEntry.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('ProcurementService.seedShortlistFromBasket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvaluateBasket.mockReset();
  });

  // Every evaluation result the BasketsService would give us.
  const baseRanking = [
    {
      system: { id: 'sys-1', name: 'Alpha', vendor: 'A', category: 'SIS' },
      score: 80,
      maxScore: 100,
      percentage: 80,
      rank: 1,
    },
    {
      system: { id: 'sys-2', name: 'Beta', vendor: 'B', category: 'LMS' },
      score: 40,
      maxScore: 100,
      percentage: 40,
      rank: 2,
    },
    {
      system: { id: 'sys-3', name: 'Gamma', vendor: 'G', category: 'HCM' },
      score: 10,
      maxScore: 100,
      percentage: 10,
      rank: 3,
    },
  ];

  it('seeds every ranked system when no topN / minPercentage is given', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      id: 'p1',
      basketId: 'bk1',
    } as never);
    mockEvaluateBasket.mockResolvedValueOnce(baseRanking);
    vi.mocked(prisma.shortlistEntry.findMany)
      .mockResolvedValueOnce([]) // pre-transaction check: empty shortlist
      .mockResolvedValueOnce([]); // post-seed re-read (mocked minimal)
    vi.mocked(prisma.shortlistEntry.createMany).mockResolvedValueOnce({
      count: 3,
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const result = await service.seedShortlistFromBasket(
      'p1',
      {},
      { userId: 'u1', name: 'Alice' },
    );

    expect(result.added).toBe(3);
    expect(result.skipped).toBe(0);

    // createMany receives every ranked system as a longlist entry.
    expect(prisma.shortlistEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ projectId: 'p1', systemId: 'sys-1', status: 'longlist', score: 80 }),
        expect.objectContaining({ projectId: 'p1', systemId: 'sys-2', score: 40 }),
        expect.objectContaining({ projectId: 'p1', systemId: 'sys-3', score: 10 }),
      ],
      skipDuplicates: true,
    });

    // Audit row carries the full ranking and the actor — auditors can
    // reconstruct the seed even after the basket evolves.
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'procurement.shortlist.seed',
        entityType: 'ProcurementProject',
        entityId: 'p1',
        userId: 'u1',
        changes: expect.objectContaining({
          basketId: 'bk1',
          added: 3,
          skippedAlreadyOnShortlist: 0,
          actorName: 'Alice',
          ranking: expect.arrayContaining([
            expect.objectContaining({ systemId: 'sys-1', percentage: 80 }),
          ]),
        }),
      }),
    });
  });

  it('applies topN cap and minPercentage filter together', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      id: 'p1',
      basketId: 'bk1',
    } as never);
    mockEvaluateBasket.mockResolvedValueOnce(baseRanking);
    vi.mocked(prisma.shortlistEntry.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.mocked(prisma.shortlistEntry.createMany).mockResolvedValueOnce({
      count: 1,
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    // minPercentage=50 drops sys-2 (40%) and sys-3 (10%) → only sys-1
    // survives; topN=2 is a no-op after the filter.
    await service.seedShortlistFromBasket('p1', { topN: 2, minPercentage: 50 });

    expect(prisma.shortlistEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ systemId: 'sys-1', score: 80 }),
      ],
      skipDuplicates: true,
    });
  });

  it('dedupes against systems already on the shortlist', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      id: 'p1',
      basketId: 'bk1',
    } as never);
    mockEvaluateBasket.mockResolvedValueOnce(baseRanking);
    // sys-2 is already on the shortlist (maybe added manually earlier).
    vi.mocked(prisma.shortlistEntry.findMany)
      .mockResolvedValueOnce([{ systemId: 'sys-2' }] as never)
      .mockResolvedValueOnce([]);
    vi.mocked(prisma.shortlistEntry.createMany).mockResolvedValueOnce({
      count: 2,
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const result = await service.seedShortlistFromBasket('p1', {});

    expect(result.added).toBe(2);
    expect(result.skipped).toBe(1);
    // Only the two new systems are passed to createMany — the existing
    // sys-2 entry is not overwritten.
    expect(prisma.shortlistEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ systemId: 'sys-1' }),
        expect.objectContaining({ systemId: 'sys-3' }),
      ],
      skipDuplicates: true,
    });
  });

  it('audit counts reflect createMany.count, not the pre-flight computation (TOCTOU)', async () => {
    // Scenario: pre-flight read sees no existing entries → all 3 systems
    // are candidates to add. Between that read and our createMany, a
    // concurrent seed landed sys-1, so skipDuplicates drops it and
    // createMany returns count=2. The audit log + response must report
    // `added=2` / `skipped=1`, NOT `added=3` / `skipped=0`.
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      id: 'p1',
      basketId: 'bk1',
    } as never);
    mockEvaluateBasket.mockResolvedValueOnce(baseRanking);
    vi.mocked(prisma.shortlistEntry.findMany)
      .mockResolvedValueOnce([]) // in-tx pre-check: empty at snapshot
      .mockResolvedValueOnce([]); // post-seed re-read
    // createMany's count reflects the actual racing outcome.
    vi.mocked(prisma.shortlistEntry.createMany).mockResolvedValueOnce({
      count: 2,
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const result = await service.seedShortlistFromBasket(
      'p1',
      {},
      { userId: 'u1', name: 'Alice' },
    );

    expect(result.added).toBe(2);
    expect(result.skipped).toBe(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: expect.objectContaining({
          added: 2,
          skippedAlreadyOnShortlist: 1,
        }),
      }),
    });
  });

  it('throws ValidationError when the project has no linked basket', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      id: 'p1',
      basketId: null,
    } as never);

    await expect(
      service.seedShortlistFromBasket('p1', {}),
    ).rejects.toThrow(/no linked basket/);

    expect(mockEvaluateBasket).not.toHaveBeenCalled();
    expect(prisma.shortlistEntry.createMany).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the project does not exist', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce(null);
    await expect(
      service.seedShortlistFromBasket('missing', {}),
    ).rejects.toThrow(/Project not found/);
  });

  it('short-circuits on an empty basket without writing an audit row', async () => {
    vi.mocked(prisma.procurementProject.findUnique).mockResolvedValueOnce({
      id: 'p1',
      basketId: 'bk1',
    } as never);
    mockEvaluateBasket.mockResolvedValueOnce([]); // empty basket → empty eval

    const result = await service.seedShortlistFromBasket('p1', {});
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.ranking).toEqual([]);
    // No side effects for a no-op seed.
    expect(prisma.shortlistEntry.createMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
