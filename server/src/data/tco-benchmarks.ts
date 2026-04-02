// server/src/data/tco-benchmarks.ts
// Realistic UK HE TCO benchmarks per system (GBP, medium institution, 12k students)

export interface TcoBenchmark {
  licencePerStudent: number;
  implementationMonths: number;
  implementationMultiplier: number;
  internalFteRequired: number;
  internalFteAnnualCost: number;
  typicalSupportPct: number;
  infrastructureAnnual: number;
  customDevAnnual: number;
  trainingOneOff: number;
  notes: string;
}

export interface TcoResult {
  annualLicence: number;
  implementationCost: number;
  annualInternalStaff: number;
  annualSupport: number;
  annualRunRate: number;
  totalTco: number;
  perStudentAnnual: number;
  perStudentTco: number;
  breakdown: {
    licence: number;
    implementation: number;
    staff: number;
    support: number;
    infrastructure: number;
    customDev: number;
  };
}

export const TCO_BENCHMARKS: Record<string, TcoBenchmark> = {
  banner: {
    licencePerStudent: 14,
    implementationMonths: 24,
    implementationMultiplier: 2.0,
    internalFteRequired: 3,
    internalFteAnnualCost: 45000,
    typicalSupportPct: 0.18,
    infrastructureAnnual: 60000,
    customDevAnnual: 40000,
    trainingOneOff: 80000,
    notes: 'Banner 9 cloud hosting. Assumes Ethos Integration layer.',
  },
  sits: {
    licencePerStudent: 22,
    implementationMonths: 18,
    implementationMultiplier: 1.5,
    internalFteRequired: 2,
    internalFteAnnualCost: 45000,
    typicalSupportPct: 0.15,
    infrastructureAnnual: 40000,
    customDevAnnual: 25000,
    trainingOneOff: 60000,
    notes: 'SITS Vision Cloud site licence. UK data centre.',
  },
  workday_student: {
    licencePerStudent: 40,
    implementationMonths: 24,
    implementationMultiplier: 2.5,
    internalFteRequired: 2,
    internalFteAnnualCost: 50000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 20000,
    trainingOneOff: 100000,
    notes: 'Workday SaaS — no infrastructure cost. Bi-annual updates included.',
  },
  oracle_student: {
    licencePerStudent: 28,
    implementationMonths: 20,
    implementationMultiplier: 2.0,
    internalFteRequired: 2,
    internalFteAnnualCost: 48000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 30000,
    trainingOneOff: 90000,
    notes: 'Oracle Cloud — SaaS model. Oracle Cloud Infrastructure included.',
  },
  sap_slcm: {
    licencePerStudent: 35,
    implementationMonths: 36,
    implementationMultiplier: 3.0,
    internalFteRequired: 3,
    internalFteAnnualCost: 50000,
    typicalSupportPct: 0.20,
    infrastructureAnnual: 50000,
    customDevAnnual: 60000,
    trainingOneOff: 120000,
    notes: 'SAP full suite. High implementation complexity. Strong if already SAP shop.',
  },
  colleague: {
    licencePerStudent: 10,
    implementationMonths: 15,
    implementationMultiplier: 1.5,
    internalFteRequired: 2,
    internalFteAnnualCost: 42000,
    typicalSupportPct: 0.18,
    infrastructureAnnual: 30000,
    customDevAnnual: 20000,
    trainingOneOff: 50000,
    notes: 'Colleague cloud hosted. Value option for smaller institutions.',
  },
  peoplesoft: {
    licencePerStudent: 18,
    implementationMonths: 36,
    implementationMultiplier: 3.0,
    internalFteRequired: 4,
    internalFteAnnualCost: 48000,
    typicalSupportPct: 0.22,
    infrastructureAnnual: 80000,
    customDevAnnual: 70000,
    trainingOneOff: 100000,
    notes: 'PeopleSoft on-premise. High ongoing maintenance. End-of-primary-support risk.',
  },
  anthology_student: {
    licencePerStudent: 20,
    implementationMonths: 18,
    implementationMultiplier: 1.8,
    internalFteRequired: 2,
    internalFteAnnualCost: 45000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 25000,
    trainingOneOff: 70000,
    notes: 'Anthology Student cloud. Azure-hosted. Integration with Blackboard included.',
  },
  unit4: {
    licencePerStudent: 25,
    implementationMonths: 18,
    implementationMultiplier: 1.8,
    internalFteRequired: 2,
    internalFteAnnualCost: 45000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 20000,
    trainingOneOff: 65000,
    notes: 'Unit4 ERPx cloud. European data centres. Finance+Student+HR bundled.',
  },
  ellucian_student: {
    licencePerStudent: 35,
    implementationMonths: 18,
    implementationMultiplier: 2.0,
    internalFteRequired: 2,
    internalFteAnnualCost: 48000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 15000,
    trainingOneOff: 80000,
    notes: 'Ellucian Student SaaS — new platform. Premium pricing for modern stack.',
  },
  canvas: {
    licencePerStudent: 6,
    implementationMonths: 4,
    implementationMultiplier: 0.5,
    internalFteRequired: 1,
    internalFteAnnualCost: 40000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 5000,
    trainingOneOff: 20000,
    notes: 'Canvas LMS SaaS. Very fast to implement. Additional cost for Canvas Studio.',
  },
  blackboard: {
    licencePerStudent: 6,
    implementationMonths: 6,
    implementationMultiplier: 0.6,
    internalFteRequired: 1,
    internalFteAnnualCost: 40000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 5000,
    trainingOneOff: 25000,
    notes: 'Blackboard Ultra SaaS. Ultra migration cost additional if from Classic.',
  },
  moodle: {
    licencePerStudent: 2,
    implementationMonths: 3,
    implementationMultiplier: 1.0,
    internalFteRequired: 1,
    internalFteAnnualCost: 40000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 15000,
    customDevAnnual: 10000,
    trainingOneOff: 15000,
    notes: 'Moodle self-hosted (MoodleCloud). Low licence — higher internal hosting cost.',
  },
  brightspace: {
    licencePerStudent: 7,
    implementationMonths: 4,
    implementationMultiplier: 0.5,
    internalFteRequired: 1,
    internalFteAnnualCost: 40000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 5000,
    trainingOneOff: 20000,
    notes: 'D2L Brightspace SaaS. Strong accessibility and analytics included.',
  },
  aula: {
    licencePerStudent: 9,
    implementationMonths: 2,
    implementationMultiplier: 0.3,
    internalFteRequired: 0.5,
    internalFteAnnualCost: 40000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 2000,
    trainingOneOff: 10000,
    notes: 'Aula LXP. Fast to deploy. Not full LMS — may need to pair with assessment tool.',
  },
  anthology_reach: {
    licencePerStudent: 30,
    implementationMonths: 10,
    implementationMultiplier: 1.5,
    internalFteRequired: 2,
    internalFteAnnualCost: 45000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 20000,
    trainingOneOff: 50000,
    notes: 'Anthology Reach on Dynamics 365. Microsoft licence costs additional.',
  },
  salesforce_edu: {
    licencePerStudent: 50,
    implementationMonths: 12,
    implementationMultiplier: 2.0,
    internalFteRequired: 2,
    internalFteAnnualCost: 50000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 30000,
    trainingOneOff: 60000,
    notes: 'Salesforce per-user pricing (shown here as per-student equivalent). High admin cost.',
  },
  campusm: {
    licencePerStudent: 7,
    implementationMonths: 3,
    implementationMultiplier: 0.4,
    internalFteRequired: 0.5,
    internalFteAnnualCost: 40000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 5000,
    trainingOneOff: 15000,
    notes: 'campusM site licence. Requires SIS integration. 50+ UK references.',
  },
  modern_campus: {
    licencePerStudent: 15,
    implementationMonths: 6,
    implementationMultiplier: 0.8,
    internalFteRequired: 1,
    internalFteAnnualCost: 42000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 10000,
    trainingOneOff: 25000,
    notes: 'Modern Campus for CE/LLL. Per-institution pricing. US-centric.',
  },
  workday_hcm: {
    licencePerStudent: 0,
    implementationMonths: 16,
    implementationMultiplier: 2.0,
    internalFteRequired: 2,
    internalFteAnnualCost: 50000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 0,
    customDevAnnual: 20000,
    trainingOneOff: 80000,
    notes: 'Workday HCM per-employee pricing (not per student). Priced separately from Student.',
  },
  sjms: {
    licencePerStudent: 0,
    implementationMonths: 0,
    implementationMultiplier: 0,
    internalFteRequired: 4,
    internalFteAnnualCost: 55000,
    typicalSupportPct: 0.0,
    infrastructureAnnual: 25000,
    customDevAnnual: 80000,
    trainingOneOff: 10000,
    notes: 'SJMS v4 internal development. No licence cost. Higher internal staff and dev cost.',
  },
};

export function calculateTco(
  systemSlug: string,
  studentCount: number,
  horizonYears: number,
  overrides: Partial<TcoBenchmark> = {}
): TcoResult {
  const bench: TcoBenchmark = { ...(TCO_BENCHMARKS[systemSlug] ?? TCO_BENCHMARKS['sits']!), ...overrides };

  const annualLicence = bench.licencePerStudent * studentCount;
  const implementationCost = annualLicence * bench.implementationMultiplier + bench.trainingOneOff;
  const annualInternalStaff = bench.internalFteRequired * bench.internalFteAnnualCost;
  const annualSupport = annualLicence * bench.typicalSupportPct;
  const annualRunRate =
    annualLicence +
    annualInternalStaff +
    annualSupport +
    bench.infrastructureAnnual +
    bench.customDevAnnual;

  let totalTco = implementationCost;
  for (let y = 0; y < horizonYears; y++) {
    const growthFactor = Math.pow(1.03, y);
    totalTco += annualRunRate * growthFactor;
  }

  return {
    annualLicence,
    implementationCost,
    annualInternalStaff,
    annualSupport,
    annualRunRate,
    totalTco,
    perStudentAnnual: studentCount > 0 ? annualRunRate / studentCount : 0,
    perStudentTco: studentCount > 0 ? totalTco / studentCount : 0,
    breakdown: {
      licence: annualLicence,
      implementation: implementationCost,
      staff: annualInternalStaff,
      support: annualSupport,
      infrastructure: bench.infrastructureAnnual,
      customDev: bench.customDevAnnual,
    },
  };
}
