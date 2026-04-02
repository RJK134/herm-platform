import prisma from '../../utils/prisma';
import { NotFoundError } from '../../utils/errors';
import type { ValueAnalysisInput } from './value.schema';

// HM Treasury Green Book discount rate for NPV
const DISCOUNT_RATE = 0.035;

interface ValueResult {
  // Benefit breakdown
  adminBenefit: number;
  registryBenefit: number;
  errorBenefit: number;
  complianceBenefit: number;
  studentBenefit: number;
  otherBenefit: number;
  totalAnnualBenefits: number;
  // Cost breakdown
  annualLicenceCost: number;
  annualSupportCost: number;
  annualInternalStaffCost: number;
  totalAnnualCosts: number;
  // Net
  netAnnualBenefit: number;
  // Financials
  roi3Year: number;
  roi5Year: number;
  npv5Year: number;
  paybackMonths: number;
  // Context
  breakEvenYear: number | null;
  currentStateTotalAnnual: number;
  savingVsCurrentState: number;
  // Year-by-year cashflow for charts
  cashflowByYear: Array<{ year: number; costs: number; benefits: number; net: number; cumulative: number }>;
}

export function calculateValue(data: ValueAnalysisInput): ValueResult {
  // Quantified benefits
  const adminBenefit = data.adminStaffAffected * data.avgAdminSalaryGbp * (data.adminEfficiencyPct / 100);
  const registryBenefit = data.registryStaffAffected * data.avgRegistrySalaryGbp * (data.registryEfficiencyPct / 100);
  const errorBenefit = data.errorCostCurrentAnnual * (data.errorReductionPct / 100);
  const complianceBenefit = data.complianceSavingAnnual;
  const studentBenefit = data.studentExperienceValue;
  const otherBenefit = data.otherBenefitsAnnual;

  const totalAnnualBenefits = adminBenefit + registryBenefit + errorBenefit + complianceBenefit + studentBenefit + otherBenefit;
  const totalAnnualCosts = data.annualLicenceCost + data.annualSupportCost + data.annualInternalStaffCost;
  const netAnnualBenefit = totalAnnualBenefits - totalAnnualCosts;

  // ROI over N years = (total benefits − total costs) / total investment × 100
  const calcRoi = (years: number): number => {
    const totalBenefits = totalAnnualBenefits * years;
    const totalCosts = data.implementationCost + totalAnnualCosts * years;
    return totalCosts > 0 ? ((totalBenefits - totalCosts) / totalCosts) * 100 : 0;
  };

  const roi3Year = calcRoi(3);
  const roi5Year = calcRoi(5);

  // NPV over 5 years (HM Treasury Green Book 3.5% rate)
  let npv5Year = -data.implementationCost;
  for (let y = 1; y <= 5; y++) {
    npv5Year += netAnnualBenefit / Math.pow(1 + DISCOUNT_RATE, y);
  }

  // Payback in months (month-by-month until cumulative cashflow ≥ 0)
  let cumulative = -data.implementationCost;
  let paybackMonths = 0;
  for (let m = 1; m <= 120; m++) {
    cumulative += netAnnualBenefit / 12;
    if (cumulative >= 0) {
      paybackMonths = m;
      break;
    }
  }

  // Break-even year
  const breakEvenYear = paybackMonths > 0 ? Math.ceil(paybackMonths / 12) : null;

  // Current state total annual spend
  const currentStateTotalAnnual = data.currentSystemCostAnnual + data.currentMaintenanceCost + data.currentSupportCost;
  const savingVsCurrentState = currentStateTotalAnnual - totalAnnualCosts;

  // Year-by-year cashflow (year 0 = implementation)
  const cashflowByYear: ValueResult['cashflowByYear'] = [];
  let running = -data.implementationCost;
  cashflowByYear.push({ year: 0, costs: data.implementationCost, benefits: 0, net: -data.implementationCost, cumulative: running });

  for (let y = 1; y <= 5; y++) {
    const yearNet = netAnnualBenefit;
    running += yearNet;
    cashflowByYear.push({
      year: y,
      costs: totalAnnualCosts,
      benefits: totalAnnualBenefits,
      net: yearNet,
      cumulative: running,
    });
  }

  return {
    adminBenefit,
    registryBenefit,
    errorBenefit,
    complianceBenefit,
    studentBenefit,
    otherBenefit,
    totalAnnualBenefits,
    annualLicenceCost: data.annualLicenceCost,
    annualSupportCost: data.annualSupportCost,
    annualInternalStaffCost: data.annualInternalStaffCost,
    totalAnnualCosts,
    netAnnualBenefit,
    roi3Year,
    roi5Year,
    npv5Year,
    paybackMonths,
    breakEvenYear,
    currentStateTotalAnnual,
    savingVsCurrentState,
    cashflowByYear,
  };
}

// UK HE sector benchmarks for value analysis guidance
export const VALUE_BENCHMARKS = {
  adminEfficiency: {
    conservative: 8,
    central: 15,
    optimistic: 22,
    description: 'Typical admin staff time saving from modern SIS vs legacy (% of FTE)',
  },
  registryEfficiency: {
    conservative: 10,
    central: 18,
    optimistic: 28,
    description: 'Registry staff time saving from automated workflows and self-service',
  },
  errorReduction: {
    conservative: 20,
    central: 45,
    optimistic: 70,
    description: 'Reduction in data errors/rework with integrated system vs disconnected legacy',
  },
  avgAdminSalary: {
    band1: 28000,  // Admin Grade 4
    band2: 33000,  // Admin Grade 5
    band3: 38000,  // Admin/Senior Grade 6
    band4: 44000,  // Registry/Professional Grade 7
    typical: 35000,
    description: 'UK HE administrative staff salary benchmarks (GBP, 2025)',
  },
  avgRegistrySalary: {
    typical: 42000,
    senior: 52000,
    description: 'UK HE registry staff salary benchmarks (GBP, 2025)',
  },
  studentExperienceValue: {
    perNssPoint: 250000,  // Rough value of 1 NSS point improvement at 10,000 FTE institution
    description: 'Value of 1% improvement in NSS satisfaction score (tuition fee retention + reputation)',
  },
  complianceRisk: {
    hesaResubmission: 50000,     // Estimated cost of major HESA data quality resubmission
    gdprBreach: 500000,           // Conservative estimate of GDPR fine + remediation
    ofsPenalty: 1000000,          // Illustrative OfS regulatory sanction
    description: 'UK HE compliance risk costs (illustrative, annual)',
  },
};

export class ValueService {
  async calculate(data: ValueAnalysisInput) {
    return calculateValue(data);
  }

  async saveAnalysis(data: ValueAnalysisInput) {
    const results = calculateValue(data);

    return prisma.valueAnalysis.create({
      data: {
        name: data.name,
        institutionId: data.institutionId ?? null,
        systemId: data.systemId ?? null,
        studentFte: data.studentFte,
        staffFte: data.staffFte,
        institutionType: data.institutionType,
        currentSystemCostAnnual: data.currentSystemCostAnnual,
        currentMaintenanceCost: data.currentMaintenanceCost,
        currentSupportCost: data.currentSupportCost,
        adminEfficiencyPct: data.adminEfficiencyPct,
        adminStaffAffected: data.adminStaffAffected,
        avgAdminSalaryGbp: data.avgAdminSalaryGbp,
        registryEfficiencyPct: data.registryEfficiencyPct,
        registryStaffAffected: data.registryStaffAffected,
        avgRegistrySalaryGbp: data.avgRegistrySalaryGbp,
        errorReductionPct: data.errorReductionPct,
        errorCostCurrentAnnual: data.errorCostCurrentAnnual,
        complianceSavingAnnual: data.complianceSavingAnnual,
        studentExperienceValue: data.studentExperienceValue,
        otherBenefitsAnnual: data.otherBenefitsAnnual,
        implementationCost: data.implementationCost,
        annualLicenceCost: data.annualLicenceCost,
        annualSupportCost: data.annualSupportCost,
        annualInternalStaffCost: data.annualInternalStaffCost,
        totalAnnualBenefits: results.totalAnnualBenefits,
        totalAnnualCosts: results.totalAnnualCosts,
        netAnnualBenefit: results.netAnnualBenefit,
        roi3Year: results.roi3Year,
        roi5Year: results.roi5Year,
        npv5Year: results.npv5Year,
        paybackMonths: results.paybackMonths,
        notes: data.notes ?? null,
        createdById: data.institutionId ?? 'anonymous',
      },
      include: { targetSystem: { select: { id: true, name: true, vendor: true } } },
    });
  }

  async listAnalyses() {
    return prisma.valueAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        roi5Year: true,
        npv5Year: true,
        paybackMonths: true,
        createdAt: true,
        targetSystem: { select: { id: true, name: true, vendor: true } },
      },
    });
  }

  async getAnalysis(id: string) {
    const item = await prisma.valueAnalysis.findUnique({
      where: { id },
      include: { targetSystem: { select: { id: true, name: true, vendor: true, category: true } } },
    });
    if (!item) throw new NotFoundError(`Value analysis not found: ${id}`);
    return item;
  }

  getBenchmarks() {
    return VALUE_BENCHMARKS;
  }
}
