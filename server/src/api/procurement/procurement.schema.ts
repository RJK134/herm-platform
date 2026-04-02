import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  jurisdiction: z.string().optional(),
  institutionId: z.string().optional(),
  basketId: z.string().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.string().optional(),
  jurisdiction: z.string().optional(),
  basketId: z.string().optional(),
});

export const updateStageSchema = z.object({
  status: z.enum(['pending', 'active', 'complete', 'skipped']).optional(),
  notes: z.string().optional(),
  outputs: z.record(z.unknown()).optional(),
});

export const addShortlistEntrySchema = z.object({
  systemId: z.string().min(1),
  status: z.enum(['longlist', 'shortlist', 'preferred', 'eliminated']).optional(),
  notes: z.string().optional(),
  score: z.number().optional(),
});

export const updateShortlistEntrySchema = z.object({
  status: z.enum(['longlist', 'shortlist', 'preferred', 'eliminated']).optional(),
  notes: z.string().optional(),
  score: z.number().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
export type AddShortlistEntryInput = z.infer<typeof addShortlistEntrySchema>;
export type UpdateShortlistEntryInput = z.infer<typeof updateShortlistEntrySchema>;
