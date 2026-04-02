import { z } from 'zod';

export const systemNodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: z.enum(['SIS', 'LMS', 'CRM', 'HCM', 'Finance', 'HR', 'Library', 'Portal', 'Email', 'VLE', 'Other']),
  vendor: z.string().optional(),
  ageYears: z.number().min(0).max(50).default(5),
  criticalityScore: z.number().min(1).max(5).default(3),   // 1=low … 5=mission-critical
  userCount: z.number().min(0).default(0),
  contractEndYear: z.number().optional(),
  cloudNative: z.boolean().default(false),
  notes: z.string().optional(),
});

export const integrationLinkSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  protocol: z.enum(['REST', 'SOAP', 'SFTP', 'Database', 'CSV', 'Message Queue', 'Proprietary', 'None']),
  complexity: z.enum(['low', 'medium', 'high']).default('medium'),
  dataVolume: z.enum(['low', 'medium', 'high']).default('medium'),
  realTime: z.boolean().default(false),
});

export const createArchitectureAssessmentSchema = z.object({
  name: z.string().min(2).max(200),
  institutionId: z.string().optional(),
  targetSystemId: z.string().optional(),
  currentSystems: z.array(systemNodeSchema),
  integrationLinks: z.array(integrationLinkSchema),
  architecturePattern: z.enum([
    'point-to-point',
    'file-transfer',
    'shared-database',
    'messaging',
    'api-gateway',
    'esb',
    'ipaas',
    'event-driven',
  ]).default('point-to-point'),
  dataRisk: z.number().min(0).max(100).default(0),
  cutoverRisk: z.number().min(0).max(100).default(0),
  integrationRisk: z.number().min(0).max(100).default(0),
  changeRisk: z.number().min(0).max(100).default(0),
  notes: z.string().optional(),
});

export type SystemNode = z.infer<typeof systemNodeSchema>;
export type IntegrationLink = z.infer<typeof integrationLinkSchema>;
export type CreateArchitectureAssessmentInput = z.infer<typeof createArchitectureAssessmentSchema>;
