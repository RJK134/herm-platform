import { z } from 'zod';

export const calculateTcoSchema = z.object({
  systemSlug: z.string().min(1),
  studentCount: z.number().int().min(1).max(500000),
  horizonYears: z.number().int().min(1).max(20),
  overrides: z
    .object({
      licencePerStudent: z.number().optional(),
      implementationMultiplier: z.number().optional(),
      internalFteRequired: z.number().optional(),
      internalFteAnnualCost: z.number().optional(),
      typicalSupportPct: z.number().optional(),
      infrastructureAnnual: z.number().optional(),
      customDevAnnual: z.number().optional(),
      trainingOneOff: z.number().optional(),
    })
    .optional(),
});

export const compareTcoSchema = z.object({
  systemSlugs: z.array(z.string().min(1)).min(1).max(8),
  studentCount: z.number().int().min(1).max(500000),
  horizonYears: z.number().int().min(1).max(20),
});

/**
 * Phase 4: `createdById` is intentionally NOT accepted from the body.
 * The route requires an authenticated JWT, and the server stamps the
 * creator from `req.user` so a client can't forge attribution. A
 * body-supplied override would be silently ignored anyway — omit it.
 *
 * Similarly `institutionId` defaults to the caller's institution from
 * the JWT; a body override is still accepted for SUPER_ADMIN flows
 * that save estimates on behalf of another tenant.
 */
export const saveEstimateSchema = z.object({
  name: z.string().min(1).max(200),
  institutionSize: z.enum(['small', 'medium', 'large', 'xlarge']),
  studentFte: z.number().int().min(1),
  staffFte: z.number().int().min(0),
  currency: z.string().optional(),
  horizonYears: z.number().int().min(1).max(20).optional(),
  systemId: z.string().optional(),
  licenceCostYear1: z.number().optional(),
  licenceCostGrowth: z.number().optional(),
  implementationCost: z.number().optional(),
  internalStaffCost: z.number().optional(),
  trainingCost: z.number().optional(),
  infrastructureCost: z.number().optional(),
  integrationCost: z.number().optional(),
  supportCost: z.number().optional(),
  customDevCost: z.number().optional(),
  totalTco: z.number().optional(),
  annualRunRate: z.number().optional(),
  perStudentCost: z.number().optional(),
  notes: z.string().optional(),
  institutionId: z.string().optional(),
});

export type CalculateTcoInput = z.infer<typeof calculateTcoSchema>;
export type CompareTcoInput = z.infer<typeof compareTcoSchema>;
export type SaveEstimateInput = z.infer<typeof saveEstimateSchema>;
