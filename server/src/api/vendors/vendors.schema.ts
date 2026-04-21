import { z } from 'zod';

export const updateVendorProfileSchema = z
  .object({
    foundedYear: z.number().int().min(1800).max(2100).optional(),
    headquarters: z.string().max(200).optional(),
    employees: z.string().max(100).optional(),
    marketShare: z.string().max(100).optional(),
    gartnerPosition: z.string().max(200).optional(),
    deploymentModel: z.array(z.string().max(80)).max(20).optional(),
    techStack: z.string().max(1000).optional(),
    apiStandards: z.array(z.string().max(80)).max(40).optional(),
    integrationProtocols: z.array(z.string().max(80)).max(40).optional(),
    certifications: z.array(z.string().max(100)).max(40).optional(),
    pricingModel: z.string().max(200).optional(),
    typicalCostRange: z.string().max(200).optional(),
    implementationTime: z.string().max(200).optional(),
    keyStrengths: z.array(z.string().max(500)).max(30).optional(),
    knownLimitations: z.array(z.string().max(500)).max(30).optional(),
    recentNews: z.string().max(5000).optional(),
  })
  .strict();

export type UpdateVendorProfileInput = z.infer<typeof updateVendorProfileSchema>;
