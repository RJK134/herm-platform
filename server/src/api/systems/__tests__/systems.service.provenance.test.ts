import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/prisma', () => {
  const vendorSystem = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  };
  const capabilityScore = {
    findMany: vi.fn(),
  };
  const frameworkDomain = {
    findMany: vi.fn(),
  };
  return {
    default: { vendorSystem, capabilityScore, frameworkDomain },
  };
});

import { SystemsService } from '../systems.service';
import prisma from '../../../utils/prisma';

const service = new SystemsService();

describe('SystemsService.getSystemScores — scoring provenance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('surfaces evidence, source, scoredBy, scoredAt, and version for each capability', async () => {
    vi.mocked(prisma.vendorSystem.findUnique).mockResolvedValueOnce({
      id: 'sys-1',
      name: 'Test System',
    } as never);
    vi.mocked(prisma.capabilityScore.findMany).mockResolvedValueOnce([
      {
        id: 'cs-1',
        systemId: 'sys-1',
        capabilityId: 'cap-bc001',
        value: 100,
        evidence: 'Vendor-confirmed in RFI response § 3.2',
        source: 'RFI 2026-01',
        scoredBy: 'Alice Reviewer',
        scoredAt: new Date('2026-01-15T10:00:00Z'),
        version: 2,
        capability: {
          code: 'BC001',
          name: 'Student Onboarding',
          domain: { code: 'LT', name: 'Learning & Teaching' },
        },
      },
      {
        id: 'cs-2',
        systemId: 'sys-1',
        capabilityId: 'cap-bc011',
        value: 50,
        evidence: null,
        source: null,
        scoredBy: null,
        scoredAt: new Date('2026-01-01T00:00:00Z'),
        version: 1,
        capability: {
          code: 'BC011',
          name: 'Enrolment',
          domain: { code: 'LT', name: 'Learning & Teaching' },
        },
      },
    ] as never);

    const result = await service.getSystemScores('sys-1');

    expect(result.byDomain).toHaveLength(1);
    const lt = result.byDomain[0]!;
    expect(lt.capabilities).toHaveLength(2);

    const bc001 = lt.capabilities.find((c) => c.code === 'BC001')!;
    expect(bc001).toMatchObject({
      code: 'BC001',
      name: 'Student Onboarding',
      value: 100,
      evidence: 'Vendor-confirmed in RFI response § 3.2',
      source: 'RFI 2026-01',
      scoredBy: 'Alice Reviewer',
      version: 2,
    });
    expect(bc001.scoredAt).toBeInstanceOf(Date);

    // Scores with no evidence still surface with null fields rather than
    // silently dropping them — consumers can distinguish "no evidence
    // recorded" from "field not in response".
    const bc011 = lt.capabilities.find((c) => c.code === 'BC011')!;
    expect(bc011).toMatchObject({
      code: 'BC011',
      value: 50,
      evidence: null,
      source: null,
      scoredBy: null,
      version: 1,
    });
  });

  it('keeps the byCode map flat (code → numeric value) for back-compat', async () => {
    vi.mocked(prisma.vendorSystem.findUnique).mockResolvedValueOnce({ id: 's' } as never);
    vi.mocked(prisma.capabilityScore.findMany).mockResolvedValueOnce([
      {
        value: 100,
        evidence: 'x',
        source: 'y',
        scoredBy: 'z',
        scoredAt: new Date(),
        version: 1,
        capability: {
          code: 'BC001',
          name: 'n',
          domain: { code: 'LT', name: 'Learning & Teaching' },
        },
      },
    ] as never);

    const result = await service.getSystemScores('s');
    // Back-compat: byCode remains a simple code→number map so existing
    // clients that only care about the numeric value don't need to
    // change their shape.
    expect(result.byCode).toEqual({ BC001: 100 });
  });
});
