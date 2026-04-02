import { z } from 'zod';

export const documentMetadataSchema = z.object({
  author: z.string().default(''),
  institution: z.string().default(''),
  date: z.string().default(''),
  version: z.string().default('1.0'),
  classification: z.enum(['Public', 'Internal', 'Restricted', 'Confidential']).default('Internal'),
  reference: z.string().optional(),
});

export const generateDocumentSchema = z.object({
  title: z.string().min(2).max(300),
  type: z.enum(['BUSINESS_CASE', 'RFP_ITT', 'SHORTLIST_REPORT', 'REQUIREMENTS_SPEC', 'EXECUTIVE_SUMMARY']),
  institutionId: z.string().optional(),
  projectId: z.string().optional(),
  basketId: z.string().optional(),
  tcoEstimateId: z.string().optional(),
  valueAnalysisId: z.string().optional(),
  metadata: documentMetadataSchema.optional(),
  // Additional context fields
  institutionName: z.string().optional(),
  systemNames: z.array(z.string()).optional(),
  customIntroduction: z.string().optional(),
  customRecommendation: z.string().optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(2).max(300).optional(),
  sections: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    order: z.number(),
    locked: z.boolean().optional(),
  })).optional(),
  metadata: documentMetadataSchema.optional(),
  status: z.enum(['DRAFT', 'REVIEW', 'FINAL', 'ARCHIVED']).optional(),
});

export type GenerateDocumentInput = z.infer<typeof generateDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
