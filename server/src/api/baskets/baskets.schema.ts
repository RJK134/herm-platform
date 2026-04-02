import { z } from 'zod';

export const createBasketSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isTemplate: z.boolean().optional(),
});

export const addItemSchema = z.object({
  capabilityCode: z.string(),
  priority: z.enum(['must', 'should', 'could', 'wont']).default('must'),
  weight: z.number().min(1).max(5).default(1),
  notes: z.string().optional(),
});
