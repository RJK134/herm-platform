import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Valid email address required'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100),
  institutionName: z
    .string()
    .min(2, 'Institution name is required')
    .max(200),
  institutionCountry: z.string().default('UK'),
});

export const loginSchema = z.object({
  email: z.string().email('Valid email address required'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
});

// Phase 10.8 — MFA. The TOTP code is always 6 digits; pre-validating the
// format keeps malformed input out of the constant-time comparator.
export const mfaCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Authentication code must be 6 digits'),
});

export const mfaLoginSchema = z.object({
  challengeToken: z.string().min(1, 'challengeToken is required'),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Authentication code must be 6 digits'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;
export type MfaLoginInput = z.infer<typeof mfaLoginSchema>;
