import {
  TCO_BENCHMARKS,
  calculateTco,
  type TcoBenchmark,
  type TcoResult,
} from '../../data/tco-benchmarks';
import prisma from '../../utils/prisma';

export interface CompareResult extends TcoResult {
  systemSlug: string;
  systemName: string;
}

export interface SaveEstimateInput {
  name: string;
  institutionSize: string;
  studentFte: number;
  staffFte: number;
  currency?: string;
  horizonYears?: number;
  systemId?: string;
  licenceCostYear1?: number;
  licenceCostGrowth?: number;
  implementationCost?: number;
  internalStaffCost?: number;
  trainingCost?: number;
  infrastructureCost?: number;
  integrationCost?: number;
  supportCost?: number;
  customDevCost?: number;
  totalTco?: number;
  annualRunRate?: number;
  perStudentCost?: number;
  notes?: string;
  institutionId?: string;
  createdById?: string;
}

export class TcoService {
  getBenchmarks(): Record<string, TcoBenchmark> {
    return TCO_BENCHMARKS;
  }

  getBenchmark(slug: string): TcoBenchmark | null {
    return TCO_BENCHMARKS[slug] ?? null;
  }

  calculate(
    systemSlug: string,
    studentCount: number,
    horizonYears: number,
    overrides: Partial<TcoBenchmark> = {}
  ): TcoResult {
    return calculateTco(systemSlug, studentCount, horizonYears, overrides);
  }

  async compareMultiple(
    systemSlugs: string[],
    studentCount: number,
    horizonYears: number
  ): Promise<CompareResult[]> {
    // Look up system names from DB where possible
    const systems = await prisma.vendorSystem.findMany({
      select: { id: true, name: true },
    });

    // Build a slug-to-name map: first try DB name match, then use slug
    const slugToName = (slug: string): string => {
      const normalise = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
      const match = systems.find((s) => normalise(s.name) === slug);
      return match ? match.name : slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const results: CompareResult[] = systemSlugs.map((slug) => {
      const result = calculateTco(slug, studentCount, horizonYears);
      return {
        ...result,
        systemSlug: slug,
        systemName: slugToName(slug),
      };
    });

    return results.sort((a, b) => a.totalTco - b.totalTco);
  }

  async saveEstimate(data: SaveEstimateInput) {
    return prisma.tcoEstimate.create({
      data: {
        name: data.name,
        institutionSize: data.institutionSize,
        studentFte: data.studentFte,
        staffFte: data.staffFte,
        currency: data.currency ?? 'GBP',
        horizonYears: data.horizonYears ?? 5,
        systemId: data.systemId ?? null,
        licenceCostYear1: data.licenceCostYear1 ?? 0,
        licenceCostGrowth: data.licenceCostGrowth ?? 0.03,
        implementationCost: data.implementationCost ?? 0,
        internalStaffCost: data.internalStaffCost ?? 0,
        trainingCost: data.trainingCost ?? 0,
        infrastructureCost: data.infrastructureCost ?? 0,
        integrationCost: data.integrationCost ?? 0,
        supportCost: data.supportCost ?? 0,
        customDevCost: data.customDevCost ?? 0,
        totalTco: data.totalTco ?? 0,
        annualRunRate: data.annualRunRate ?? 0,
        perStudentCost: data.perStudentCost ?? 0,
        notes: data.notes ?? null,
        institutionId: data.institutionId ?? null,
        createdById: data.createdById ?? 'anonymous',
      },
    });
  }

  async listEstimates() {
    return prisma.tcoEstimate.findMany({
      orderBy: { createdAt: 'desc' },
      include: { system: { select: { id: true, name: true, vendor: true } } },
    });
  }

  async getEstimate(id: string) {
    return prisma.tcoEstimate.findUnique({
      where: { id },
      include: { system: { select: { id: true, name: true, vendor: true } } },
    });
  }
}
