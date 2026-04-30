/**
 * SSO discovery (Phase 10.7 — scaffold only).
 *
 * The single live endpoint, GET /api/sso/:institutionSlug/discover,
 * tells the frontend whether SSO is available for an institution
 * without revealing config details. The actual SAML/OIDC login flows
 * are not yet implemented — see docs/adr/0001-sso-architecture.md.
 *
 * Response shape (envelope from `lib/audit` / errorHandler):
 *   200 { success: true, data: { protocol, displayName, loginUrl } }
 *       // configured + enabled
 *   404 { success: false, error: { code: 'SSO_NOT_CONFIGURED', message, requestId } }
 *       // institution unknown, no row, or disabled
 *   4xx/5xx { success: false, error: { code, message, requestId } }
 *       // standard errorHandler envelope
 *
 * The discovery endpoint is INTENTIONALLY anonymous. It only reveals
 * "is SSO available for this slug" — the same information visible
 * from the institution's own login page anyway. No PII, no rate-limit
 * concerns beyond the global apiRateLimiter.
 *
 * Security note: we project the related `ssoProvider` row to ONLY the
 * public-facing columns (`enabled`, `protocol`, `displayName`). Sensitive
 * fields (`samlCert`, `oidcClientSecret`, etc.) are never pulled out of
 * Postgres on this anonymous code path, so an accidental log line or a
 * future change that serialises the prisma result can't leak them.
 */
import type { Request, Response, NextFunction } from 'express';
import prisma from '../../utils/prisma';
import { AppError } from '../../utils/errors';

export const discover = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { institutionSlug } = req.params;
    if (!institutionSlug) {
      throw new AppError(400, 'VALIDATION_ERROR', 'institutionSlug is required');
    }

    const institution = await prisma.institution.findUnique({
      where: { slug: institutionSlug },
      select: {
        ssoProvider: {
          select: {
            enabled: true,
            protocol: true,
            displayName: true,
          },
        },
      },
    });

    if (!institution || !institution.ssoProvider || !institution.ssoProvider.enabled) {
      // Single 404 code regardless of which step failed (unknown
      // slug / no row / disabled row). Avoids leaking "this slug
      // exists" vs "doesn't exist" to an unauthenticated probe.
      throw new AppError(
        404,
        'SSO_NOT_CONFIGURED',
        'SSO is not configured for this institution. Sign in with email and password instead.',
      );
    }

    const idp = institution.ssoProvider;

    res.json({
      success: true,
      data: {
        protocol: idp.protocol,
        displayName: idp.displayName,
        // The login URL points at the SP-side route that triggers the
        // IdP redirect. The route itself is not yet implemented —
        // hitting it currently returns 404 from the not-found handler.
        // Once the auth-flow PR lands, this URL becomes live without
        // a frontend change.
        loginUrl: `/api/sso/${institutionSlug}/login`,
      },
    });
  } catch (err) {
    next(err);
  }
};
