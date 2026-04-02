import { z } from 'zod';

export const vendorRegisterSchema = z.object({
  companyName: z.string().min(2).max(200),
  contactEmail: z.string().email(),
  contactName: z.string().min(2).max(100),
  password: z.string().min(8),
  websiteUrl: z.string().url().optional(),
  description: z.string().optional(),
});

export const vendorLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const vendorProfileUpdateSchema = z.object({
  companyName: z.string().min(2).max(200).optional(),
  contactName: z.string().min(2).max(100).optional(),
  websiteUrl: z.string().url().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
});

export const vendorSubmissionSchema = z.object({
  type: z.enum(['score_challenge', 'profile_update', 'new_version', 'case_study']),
  data: z.record(z.unknown()),
});

export type VendorRegisterInput = z.infer<typeof vendorRegisterSchema>;
export type VendorLoginInput = z.infer<typeof vendorLoginSchema>;
export type VendorProfileUpdateInput = z.infer<typeof vendorProfileUpdateSchema>;
export type VendorSubmissionInput = z.infer<typeof vendorSubmissionSchema>;
