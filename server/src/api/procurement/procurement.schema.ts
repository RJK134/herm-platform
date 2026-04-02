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

// Phase 4: Enhanced schemas

export const createProjectV2Schema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  jurisdiction: z.enum(['UK', 'EU', 'US_FEDERAL', 'US_STATE', 'AU']).default('UK'),
  estimatedValue: z.number().min(0).optional(),
  procurementRoute: z.enum(['open', 'restricted', 'competitive_flexible', 'competitive_dialogue', 'direct_award', 'innovation_partnership']).optional(),
  basketId: z.string().optional(),
  startDate: z.string().optional(), // ISO date string
  institutionId: z.string().optional(),
});

export const updateTaskSchema = z.object({
  isCompleted: z.boolean().optional(),
  completedBy: z.string().optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().optional(),
});

export const updateApprovalSchema = z.object({
  status: z.enum(['approved', 'rejected', 'escalated']),
  comments: z.string().optional(),
  approverName: z.string().optional(),
});

export const updateEvaluationSchema = z.object({
  hermScore: z.number().min(0).max(100).optional(),
  technicalScore: z.number().min(0).max(100).optional(),
  commercialScore: z.number().min(0).max(100).optional(),
  implementationScore: z.number().min(0).max(100).optional(),
  referenceScore: z.number().min(0).max(100).optional(),
  weightingProfile: z.object({
    herm: z.number(),
    technical: z.number(),
    commercial: z.number(),
    implementation: z.number(),
    reference: z.number(),
  }).optional(),
  recommendation: z.enum(['award', 'shortlist', 'reserve', 'reject']).optional(),
  notes: z.string().optional(),
});

export const addEvaluationSchema = z.object({
  systemId: z.string().min(1),
  evaluatorName: z.string().optional(),
  weightingProfile: z.object({
    herm: z.number(),
    technical: z.number(),
    commercial: z.number(),
    implementation: z.number(),
    reference: z.number(),
  }).optional(),
});

export type CreateProjectV2Input = z.infer<typeof createProjectV2Schema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type UpdateApprovalInput = z.infer<typeof updateApprovalSchema>;
export type UpdateEvaluationInput = z.infer<typeof updateEvaluationSchema>;
export type AddEvaluationInput = z.infer<typeof addEvaluationSchema>;
