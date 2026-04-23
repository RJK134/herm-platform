import { z } from 'zod';
import { PROJECT_STATUSES } from '../../services/domain/procurement/project-status';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  jurisdiction: z.string().optional(),
  institutionId: z.string().optional(),
  basketId: z.string().optional(),
});

// Phase 3: `status` is intentionally omitted here. Status changes must
// go through the governed state-machine endpoint (POST
// /projects/:id/status/transitions) so every move gets audit-logged,
// validated, and reviewer-attributed. Accepting status on a generic
// PATCH would let a caller jump any state in one call, skipping the
// entire governance surface.
export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
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

// ── Phase 3: workflow state transitions + shortlist governance ──────────────
// `PROJECT_STATUSES` is imported at the top of the file.

export const transitionProjectSchema = z.object({
  to: z.enum(PROJECT_STATUSES),
  note: z.string().max(2000).optional(),
});

/**
 * Decision payload for a shortlist entry. `rationale` is required — a
 * procurement decision without a written rationale is the very thing
 * Phase 3 is trying to prevent.
 *
 * Reviewer attribution (`decidedBy`) is intentionally NOT accepted from
 * the body. `authenticateJWT` guarantees a valid caller, and the server
 * stamps `decidedBy` from the JWT `name`/`userId` so the audit trail
 * can't be spoofed by a request body claiming someone else decided.
 */
export const decideShortlistSchema = z.object({
  decisionStatus: z.enum(['approved', 'rejected']),
  rationale: z.string().min(1).max(4000),
});

/**
 * Phase 4: seed a project's shortlist from its linked basket.
 *
 * - `topN` caps how many systems are added (default: no cap; add every
 *   system that passes `minPercentage`).
 * - `minPercentage` filters out systems whose basket-weighted match is
 *   below the threshold (default 0 — include every system).
 *
 * Both are optional; with neither set, every evaluated system becomes a
 * longlist entry. The service dedupes against the existing shortlist so
 * this is safe to call repeatedly as the basket evolves.
 */
export const seedShortlistFromBasketSchema = z.object({
  topN: z.number().int().min(1).max(100).optional(),
  minPercentage: z.number().min(0).max(100).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
export type AddShortlistEntryInput = z.infer<typeof addShortlistEntrySchema>;
export type UpdateShortlistEntryInput = z.infer<typeof updateShortlistEntrySchema>;
export type TransitionProjectInput = z.infer<typeof transitionProjectSchema>;
export type DecideShortlistInput = z.infer<typeof decideShortlistSchema>;
export type SeedShortlistFromBasketInput = z.infer<typeof seedShortlistFromBasketSchema>;

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
  frameworkScore: z.number().min(0).max(100).optional(),
  technicalScore: z.number().min(0).max(100).optional(),
  commercialScore: z.number().min(0).max(100).optional(),
  implementationScore: z.number().min(0).max(100).optional(),
  referenceScore: z.number().min(0).max(100).optional(),
  weightingProfile: z.object({
    framework: z.number(),
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
    framework: z.number(),
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
