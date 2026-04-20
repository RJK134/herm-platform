import { z } from 'zod';

export const createEvaluationProjectSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().optional(),
  basketId: z.string().optional(),
  deadline: z.string().optional(),
  systemIds: z.array(z.string()).min(1).max(21),
  memberEmails: z.array(z.string().email()).optional(),
  institutionId: z.string().optional(),
});

export const updateEvaluationProjectSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
  deadline: z.string().optional().nullable(),
  basketId: z.string().optional().nullable(),
});

export const addMemberSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(['lead', 'evaluator', 'observer', 'finance']).default('evaluator'),
});

export const assignDomainsSchema = z.object({
  assignments: z.array(z.object({
    domainId: z.string(),
    userId: z.string(),
  })),
});

export const submitDomainScoresSchema = z.object({
  scores: z.array(z.object({
    systemId: z.string(),
    capabilityId: z.string(),
    value: z.union([z.literal(0), z.literal(50), z.literal(100)]),
    notes: z.string().optional(),
  })),
});

export const addSystemSchema = z.object({
  systemId: z.string(),
});

export type CreateEvaluationProjectInput = z.infer<typeof createEvaluationProjectSchema>;
export type UpdateEvaluationProjectInput = z.infer<typeof updateEvaluationProjectSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type AssignDomainsInput = z.infer<typeof assignDomainsSchema>;
export type SubmitDomainScoresInput = z.infer<typeof submitDomainScoresSchema>;
