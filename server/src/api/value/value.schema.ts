import { z } from 'zod';

export const valueAnalysisInputSchema = z.object({
  name: z.string().min(2).max(200),
  institutionId: z.string().optional(),
  systemId: z.string().optional(),
  // Institution profile
  studentFte: z.number().min(100).max(100000).default(10000),
  staffFte: z.number().min(10).max(10000).default(500),
  institutionType: z.enum(['pre-92', 'post-92', 'specialist', 'international', 'other']).default('pre-92'),
  // Current state costs (annual, GBP)
  currentSystemCostAnnual: z.number().min(0).default(0),
  currentMaintenanceCost: z.number().min(0).default(0),
  currentSupportCost: z.number().min(0).default(0),
  // Operational benefits
  adminEfficiencyPct: z.number().min(0).max(100).default(0),
  adminStaffAffected: z.number().min(0).default(0),
  avgAdminSalaryGbp: z.number().min(0).default(35000),
  registryEfficiencyPct: z.number().min(0).max(100).default(0),
  registryStaffAffected: z.number().min(0).default(0),
  avgRegistrySalaryGbp: z.number().min(0).default(42000),
  // Strategic benefits
  errorReductionPct: z.number().min(0).max(100).default(0),
  errorCostCurrentAnnual: z.number().min(0).default(0),
  complianceSavingAnnual: z.number().min(0).default(0),
  studentExperienceValue: z.number().min(0).default(0),
  otherBenefitsAnnual: z.number().min(0).default(0),
  // Investment costs
  implementationCost: z.number().min(0).default(0),
  annualLicenceCost: z.number().min(0).default(0),
  annualSupportCost: z.number().min(0).default(0),
  annualInternalStaffCost: z.number().min(0).default(0),
  notes: z.string().optional(),
});

export type ValueAnalysisInput = z.infer<typeof valueAnalysisInputSchema>;
