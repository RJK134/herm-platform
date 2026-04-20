import { z } from 'zod';

const currentYear = new Date().getFullYear();

export const researchItemBaseSchema = z.object({
  title: z.string().min(1).max(500),
  publisher: z.string().min(1).max(200),
  year: z.number().int().min(1900).max(currentYear + 1),
  category: z.string().min(1).max(100),
  tags: z.array(z.string().min(1).max(80)).max(50).optional(),
  summary: z.string().max(10_000).optional(),
  url: z.string().url().max(1000).optional(),
  relevantSystems: z.array(z.string().min(1).max(128)).max(200).optional(),
});

export const createResearchSchema = researchItemBaseSchema;
export const updateResearchSchema = researchItemBaseSchema.partial();

export const listResearchQuerySchema = z.object({
  publisher: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(100).optional(),
  year: z.string().regex(/^\d{4}$/, 'year must be a 4-digit number').optional(),
  tags: z.string().max(500).optional(),
});

export type CreateResearchInput = z.infer<typeof createResearchSchema>;
export type UpdateResearchInput = z.infer<typeof updateResearchSchema>;
