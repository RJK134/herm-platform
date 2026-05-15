import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
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
// Hex-colour pattern: only the valid CSS hex lengths are admitted —
// 3 (#RGB), 4 (#RGBA), 6 (#RRGGBB), 8 (#RRGGBBAA). Bugbot 7afe9b86
// caught that the earlier `{3,8}` quantifier let through invalid 5 +
// 7 digit values like `#12345`, which pdfkit's fillColor() then either
// silently misrenders or throws on at PDF-generation time. The
// alternation-grouped pattern below rejects them up front.
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const brandingPreferencesSchema = z.object({
  logoUrl:        z.string().url('Logo URL must be a valid URL').max(2048).nullable().optional(),
  primaryColor:   z.string().regex(HEX_COLOR_RE, 'Must be a hex colour like #3730a3 (3, 4, 6, or 8 hex digits)').nullable().optional(),
  secondaryColor: z.string().regex(HEX_COLOR_RE, 'Must be a hex colour like #a5b4fc (3, 4, 6, or 8 hex digits)').nullable().optional(),
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

    // Phase 16.13 — Bugbot ee2dabec: merge with the existing JSON
    // rather than replacing it wholesale. Every field in the Zod
    // schema is `.optional()` ("update one at a time"), so sending
    // `{primaryColor: "#..."}` previously erased `logoUrl`,
    // `footerText`, etc. Read the current blob, apply only the keys
    // present in `data` (skipping `undefined`; preserving explicit
    // `null` as the "clear back to default" signal), and write back.
    const existing = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { brandingPreferences: true },
    });
    const prior = (existing?.brandingPreferences ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...prior };
    // Iterate the schema keys (not Object.keys(data)) so a request with
    // an extra unknown field can't pollute the stored blob.
    for (const key of ['logoUrl', 'primaryColor', 'secondaryColor', 'footerText'] as const) {
      // `undefined` = "field not supplied in this request, preserve prior".
      // `null`      = "explicit clear back to platform default".
      // any other   = "overwrite with new value".
      if (data[key] !== undefined) merged[key] = data[key];
    }

    const updated = await prisma.institution.update({
      where: { id: institutionId },
      // `merged` is a Record<string, unknown> from the read-merge-write
      // dance; Prisma's JSON input type wants `InputJsonValue` (no
      // unknown). The merged blob is structurally safe — every entry
      // came from either the prior column or a Zod-validated request —
      // so cast is the right call here.
      data: { brandingPreferences: merged as Prisma.InputJsonValue },
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
        // Object.keys(data) here reflects what the REQUEST supplied,
        // not the merged state — that's the audit signal worth
        // tracking ("admin changed primaryColor today").
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
