import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../utils/prisma';
import { audit } from '../../lib/audit';

/**
 * Phase 16.13 — Enterprise white-label export branding admin.
 *
 * GET /api/admin/branding   → returns the caller institution's
 *                             current brandingPreferences (or null).
 * PUT /api/admin/branding   → upserts the brandingPreferences JSON.
 *
 * Tier gate: route mount uses `requirePaidTier(['enterprise'])` so
 * Free/Pro callers never reach this controller. Even if a Pro user
 * managed to PUT (e.g. via curl bypassing the UI), the PDF / Word
 * renderer re-checks tier before applying the override — server-side
 * gate is the source of truth.
 *
 * The role guard (INSTITUTION_ADMIN / SUPER_ADMIN) is enforced by
 * the parent admin router's role-restricted block. Branding is an
 * institution-level setting, not a per-user one.
 */

// Zod-validated shape. Fields are individually optional so the admin
// can update one at a time (e.g. swap logo URL without touching the
// colour palette). All four are nullable to allow explicit "clear"
// (set the field to null in PUT body to reset to platform default).
//
// Hex-colour pattern: matches #RGB / #RRGGBB / #RRGGBBAA. URL is
// permissive — Stripe-style validation of "is the asset reachable"
// is the renderer's problem at PDF-generation time, not Zod's.
export const brandingPreferencesSchema = z.object({
  logoUrl:        z.string().url('Logo URL must be a valid URL').max(2048).nullable().optional(),
  primaryColor:   z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Must be a hex colour like #3730a3').nullable().optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Must be a hex colour like #a5b4fc').nullable().optional(),
  footerText:     z.string().trim().max(200, 'Footer text must be 200 characters or fewer').nullable().optional(),
});

export type BrandingPreferences = z.infer<typeof brandingPreferencesSchema>;

export async function getBranding(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { institutionId } = req.user!;
    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { brandingPreferences: true },
    });
    res.json({
      success: true,
      data: { brandingPreferences: institution?.brandingPreferences ?? null },
    });
  } catch (err) { next(err); }
}

export async function putBranding(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = brandingPreferencesSchema.parse(req.body);
    const { institutionId } = req.user!;
    const updated = await prisma.institution.update({
      where: { id: institutionId },
      data: { brandingPreferences: data },
      select: { brandingPreferences: true },
    });
    await audit(req, {
      action: 'admin.branding.update',
      entityType: 'Institution',
      entityId: institutionId,
      userId: req.user!.userId,
      changes: {
        // Don't dump the full payload into audit (could contain
        // multi-line footerText). Record which fields were touched.
        fields: Object.keys(data),
        hasLogoUrl: data.logoUrl != null,
        hasPrimaryColor: data.primaryColor != null,
        hasSecondaryColor: data.secondaryColor != null,
        hasFooterText: data.footerText != null,
      },
    });
    res.json({ success: true, data: { brandingPreferences: updated.brandingPreferences } });
  } catch (err) { next(err); }
}
