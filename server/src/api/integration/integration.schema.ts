import { z } from 'zod';

export const currentSystemSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  apiSupport: z.string().min(1),
});

export const createAssessmentSchema = z.object({
  name: z.string().min(1).max(200),
  currentSystems: z.array(currentSystemSchema).min(1),
  targetSystemId: z.string().optional(),
  createdById: z.string().optional(),
});

export type CurrentSystem = z.infer<typeof currentSystemSchema>;
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
