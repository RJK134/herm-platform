/**
 * SSO endpoints (Phase 10.7 scaffold + Phase 10.10 auth flows).
 *
 * Anonymous routes:
 *   GET  /api/sso/:institutionSlug/discover    Returns "is SSO available"
 *   GET  /api/sso/discover                     Same, but resolves by ?email=
 *   GET  /api/sso/sp-metadata.xml              SP metadata for IdP setup
 *   GET  /api/sso/:institutionSlug/login       302 → IdP (SAML or OIDC)
 *   POST /api/sso/:institutionSlug/saml/acs    SAML ACS callback
 *   GET  /api/sso/:institutionSlug/oidc/callback  OIDC callback
 *
 * Each flow ends with a 302 to FRONTEND_URL/login/sso?token=<jwt>; the
 * client SPA reads the token and hands it to AuthProvider. Failures
 * 302 to FRONTEND_URL/login?error=sso_failed so the user lands on the
 * password form with a banner; we deliberately do NOT echo the
 * underlying SAML / OIDC error message — it can leak details that
 * help an attacker iterate.
 *
 * Tier-gating (Q7): enforced in `sso.service.resolveSsoForFlow`. SSO
 * is Enterprise-only at the institution level; the service returns
 * the same opaque 404 as "no SSO row" so probing can't tell the cases
 * apart.
 *
 * Lockout (Q4): never invoked on this code path. SSO failures don't
 * touch `lib/lockout` — the IdP owns credential failures.
 *
 * MFA (Q10): bypassed in `sso.service.completeSsoSignIn`. SSO logins
 * mint a session JWT directly even when the User has `mfaEnabledAt`
 * set; the IdP's MFA policy stands in.
 */
import type { Request, Response, NextFunction } from 'express';
import { generateServiceProviderMetadata } from '@node-saml/node-saml';
import prisma from '../../utils/prisma';
import { AppError } from '../../utils/errors';
import { audit } from '../../lib/audit';
import { logger } from '../../lib/logger';
import {
  getFrontendBaseUrl,
  getFrontendSsoCallbackUrl,
  getSamlAcsUrl,
  getSpEntityId,
} from '../../lib/sso-config';
import {
  buildAuthnRequestUrl,
  validateSamlResponse,
  type TenantSamlConfig,
} from './saml';
import {
  buildOidcAuthorizeUrl,
  completeOidcCallback,
  type TenantOidcConfig,
} from './oidc';
import { resolveSsoForFlow, completeSsoSignIn } from './sso.service';

// ── Discovery ──────────────────────────────────────────────────────────────

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
        loginUrl: `/api/sso/${institutionSlug}/login`,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sso/discover?email=foo@example.ac.uk
 * Front-door for the login page: extracts the domain, looks up
 * Institution by `domain`, then returns the same shape as the
 * slug-based discovery (or 404 if no SSO is configured for that
 * domain).
 *
 * Anonymous. Reveals only "is SSO available for this domain" —
 * the same information visible from the institution's own login page.
 */
export const discoverByEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const email = String(req.query['email'] ?? '').trim().toLowerCase();
    if (!email.includes('@')) {
      throw new AppError(400, 'VALIDATION_ERROR', 'email query parameter required');
    }
    const domain = email.split('@')[1] ?? '';
    if (!domain) {
      throw new AppError(400, 'VALIDATION_ERROR', 'email missing domain');
    }
    const institution = await prisma.institution.findFirst({
      where: { domain },
      select: {
        slug: true,
        ssoProvider: {
          select: { enabled: true, protocol: true, displayName: true },
        },
      },
    });
    if (
      !institution ||
      !institution.ssoProvider ||
      !institution.ssoProvider.enabled
    ) {
      throw new AppError(
        404,
        'SSO_NOT_CONFIGURED',
        'No SSO configured for this email domain.',
      );
    }
    const idp = institution.ssoProvider;
    res.json({
      success: true,
      data: {
        institutionSlug: institution.slug,
        protocol: idp.protocol,
        displayName: idp.displayName,
        loginUrl: `/api/sso/${institution.slug}/login`,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── SP metadata XML ─────────────────────────────────────────────────────────

/**
 * Static SAML SP metadata. UKAMF-compliant federation registration
 * normally requires a SIGNED metadata document; v1 ships unsigned —
 * sufficient for IdPs that accept it during dev/staging. Tracked in
 * the SSO ADR's open questions.
 *
 * One document per deployment; the SP entityID and ACS URL come from
 * env. ACS URL contains a `:institutionSlug` placeholder so the IdP
 * admin can register either a generic SP (placeholder remains) or a
 * tenant-specific SP (substitute the slug).
 */
export const spMetadata = (_req: Request, res: Response, next: NextFunction): void => {
  try {
    const xml = generateServiceProviderMetadata({
      issuer: getSpEntityId(),
      callbackUrl: getSamlAcsUrl(':institutionSlug'),
    });
    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
};

// ── Login dispatch (SAML or OIDC) ──────────────────────────────────────────

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { institutionSlug } = req.params;
    if (!institutionSlug) {
      throw new AppError(400, 'VALIDATION_ERROR', 'institutionSlug is required');
    }
    const idp = await resolveSsoForFlow(institutionSlug);

    if (idp.protocol === 'SAML') {
      if (!idp.samlEntityId || !idp.samlSsoUrl || !idp.samlCert) {
        throw new AppError(
          500,
          'SSO_MISCONFIGURED',
          'IdP row is incomplete — contact the institution administrator.',
        );
      }
      const samlConfig: TenantSamlConfig = {
        samlEntityId: idp.samlEntityId,
        samlSsoUrl: idp.samlSsoUrl,
        samlCert: idp.samlCert,
      };
      const url = await buildAuthnRequestUrl(institutionSlug, samlConfig);
      res.redirect(url);
      return;
    }

    if (idp.protocol === 'OIDC') {
      if (!idp.oidcIssuer || !idp.oidcClientId || !idp.oidcClientSecret) {
        throw new AppError(
          500,
          'SSO_MISCONFIGURED',
          'IdP row is incomplete — contact the institution administrator.',
        );
      }
      const oidcConfig: TenantOidcConfig = {
        oidcIssuer: idp.oidcIssuer,
        oidcClientId: idp.oidcClientId,
        oidcClientSecret: idp.oidcClientSecret,
      };
      const url = await buildOidcAuthorizeUrl(institutionSlug, oidcConfig);
      res.redirect(url);
      return;
    }

    throw new AppError(500, 'SSO_MISCONFIGURED', `Unknown protocol: ${idp.protocol}`);
  } catch (err) {
    next(err);
  }
};

// ── SAML ACS ───────────────────────────────────────────────────────────────

/**
 * SAML POST-binding callback. Verifies the assertion, JIT-provisions
 * or links the user, and 302s to the frontend with a session JWT.
 *
 * On any verification failure we audit `auth.sso.fail` (without echoing
 * the underlying error) and 302 to `/login?error=sso_failed`. The login
 * page renders a generic banner — we never leak whether the failure
 * was signature, audience, expiry, or replay.
 */
export const samlAcs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { institutionSlug } = req.params;
    if (!institutionSlug) {
      throw new AppError(400, 'VALIDATION_ERROR', 'institutionSlug is required');
    }
    const idp = await resolveSsoForFlow(institutionSlug);
    if (idp.protocol !== 'SAML' || !idp.samlEntityId || !idp.samlSsoUrl || !idp.samlCert) {
      throw new AppError(400, 'SSO_MISCONFIGURED', 'IdP is not configured for SAML');
    }

    const samlResponseB64 = (req.body as Record<string, unknown>)?.['SAMLResponse'];
    if (typeof samlResponseB64 !== 'string' || !samlResponseB64) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Missing SAMLResponse');
    }

    const samlConfig: TenantSamlConfig = {
      samlEntityId: idp.samlEntityId,
      samlSsoUrl: idp.samlSsoUrl,
      samlCert: idp.samlCert,
    };

    let assertion;
    try {
      assertion = await validateSamlResponse(institutionSlug, samlConfig, samlResponseB64);
    } catch (err) {
      logger.warn(
        {
          institutionSlug,
          err: err instanceof Error ? err.message : String(err),
        },
        'sso.saml.acs validation failed',
      );
      await audit(req, {
        action: 'auth.sso.fail',
        entityType: 'SsoIdentityProvider',
        entityId: idp.id,
        changes: { protocol: 'SAML', reason: 'validation_failed' },
      });
      res.redirect(failureRedirect());
      return;
    }

    const token = await completeSsoSignIn(req, idp, assertion);
    res.redirect(getFrontendSsoCallbackUrl(token));
  } catch (err) {
    next(err);
  }
};

// ── OIDC callback ──────────────────────────────────────────────────────────

export const oidcCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { institutionSlug } = req.params;
    if (!institutionSlug) {
      throw new AppError(400, 'VALIDATION_ERROR', 'institutionSlug is required');
    }
    const idp = await resolveSsoForFlow(institutionSlug);
    if (idp.protocol !== 'OIDC' || !idp.oidcIssuer || !idp.oidcClientId || !idp.oidcClientSecret) {
      throw new AppError(400, 'SSO_MISCONFIGURED', 'IdP is not configured for OIDC');
    }

    const state = String(req.query['state'] ?? '');
    if (!state) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Missing state');
    }

    const oidcConfig: TenantOidcConfig = {
      oidcIssuer: idp.oidcIssuer,
      oidcClientId: idp.oidcClientId,
      oidcClientSecret: idp.oidcClientSecret,
    };

    // Reconstruct the absolute callback URL the IdP redirected to —
    // openid-client validates that the redirect_uri the IdP saw matches
    // the one stored in the flow record.
    const host = req.get('host') ?? '';
    const proto = req.get('x-forwarded-proto') ?? req.protocol;
    const callbackUrl = new URL(req.originalUrl, `${proto}://${host}`);

    let assertion;
    try {
      assertion = await completeOidcCallback(institutionSlug, oidcConfig, callbackUrl, state);
    } catch (err) {
      logger.warn(
        {
          institutionSlug,
          err: err instanceof Error ? err.message : String(err),
        },
        'sso.oidc.callback validation failed',
      );
      await audit(req, {
        action: 'auth.sso.fail',
        entityType: 'SsoIdentityProvider',
        entityId: idp.id,
        changes: { protocol: 'OIDC', reason: 'validation_failed' },
      });
      res.redirect(failureRedirect());
      return;
    }

    const token = await completeSsoSignIn(req, idp, assertion);
    res.redirect(getFrontendSsoCallbackUrl(token));
  } catch (err) {
    next(err);
  }
};

function failureRedirect(): string {
  return `${getFrontendBaseUrl()}/login?error=sso_failed`;
}
