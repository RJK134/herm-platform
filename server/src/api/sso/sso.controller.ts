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
  validateLogoutRequest,
  parseRelayState,
  type TenantSamlConfig,
} from './saml';
import { revokeBySamlSubject } from '../../lib/session-store';
import {
  buildOidcAuthorizeUrl,
  completeOidcCallback,
  type TenantOidcConfig,
} from './oidc';
import { peekFlowState } from './flow-store';
import { resolveSsoForFlow, completeSsoSignIn, listEnabledIdpsForSlug } from './sso.service';
import { getSpSigningMaterial } from '../../lib/sp-signing';

// ── Discovery ──────────────────────────────────────────────────────────────

/**
 * Phase 11.13 — discovery now returns an `options` array. For
 * back-compat with single-IdP callers, the response also surfaces the
 * highest-priority option's fields at the top level (`protocol`,
 * `displayName`, `loginUrl` — same shape as the pre-multi-IdP era).
 * Frontends that haven't been updated keep working; the new chooser
 * UI consumes `options[]`.
 */
function pickPrimary<T extends { id: string; protocol: string; displayName: string; priority: number }>(
  options: T[],
): T | null {
  return options[0] ?? null;
}

export const discover = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { institutionSlug } = req.params;
    if (!institutionSlug) {
      throw new AppError(400, 'VALIDATION_ERROR', 'institutionSlug is required');
    }

    const options = await listEnabledIdpsForSlug(institutionSlug);
    if (options.length === 0) {
      throw new AppError(
        404,
        'SSO_NOT_CONFIGURED',
        'SSO is not configured for this institution. Sign in with email and password instead.',
      );
    }
    const primary = pickPrimary(options)!;
    res.json({
      success: true,
      data: {
        // Back-compat singular fields point at the highest-priority option.
        protocol: primary.protocol,
        displayName: primary.displayName,
        loginUrl: `/api/sso/${institutionSlug}/login`,
        // Multi-IdP — every enabled option, sorted by priority.
        // Each carries its own `loginUrl` with `?idpId=` so the chooser
        // can target a specific row.
        options: options.map((o) => ({
          id: o.id,
          protocol: o.protocol,
          displayName: o.displayName,
          loginUrl: `/api/sso/${institutionSlug}/login?idpId=${encodeURIComponent(o.id)}`,
        })),
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
      select: { slug: true },
    });
    if (!institution) {
      throw new AppError(
        404,
        'SSO_NOT_CONFIGURED',
        'No SSO configured for this email domain.',
      );
    }
    const options = await listEnabledIdpsForSlug(institution.slug);
    if (options.length === 0) {
      throw new AppError(
        404,
        'SSO_NOT_CONFIGURED',
        'No SSO configured for this email domain.',
      );
    }
    const primary = pickPrimary(options)!;
    res.json({
      success: true,
      data: {
        institutionSlug: institution.slug,
        protocol: primary.protocol,
        displayName: primary.displayName,
        loginUrl: `/api/sso/${institution.slug}/login`,
        options: options.map((o) => ({
          id: o.id,
          protocol: o.protocol,
          displayName: o.displayName,
          loginUrl: `/api/sso/${institution.slug}/login?idpId=${encodeURIComponent(o.id)}`,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── SP metadata XML ─────────────────────────────────────────────────────────

/**
 * Static SAML SP metadata. UKAMF-compliant federation registration
 * requires a SIGNED metadata document; the metadata is signed when the
 * SP keypair is configured via `SP_SIGNING_KEY` + `SP_SIGNING_CERT`
 * (Phase 11.3). When the keypair is not set the document goes out
 * unsigned (legacy default — sufficient for dev / permissive IdPs).
 *
 * One document per deployment; the SP entityID and ACS URL come from
 * env. ACS URL contains a `:institutionSlug` placeholder so the IdP
 * admin can register either a generic SP (placeholder remains) or a
 * tenant-specific SP (substitute the slug).
 */
export const spMetadata = (_req: Request, res: Response, next: NextFunction): void => {
  try {
    const signing = getSpSigningMaterial();
    const xml = generateServiceProviderMetadata({
      issuer: getSpEntityId(),
      callbackUrl: getSamlAcsUrl(':institutionSlug'),
      ...(signing
        ? {
            privateKey: signing.privateKey,
            publicCerts: [signing.publicCert],
            signMetadata: true,
          }
        : {}),
    });
    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
};

// ── Login dispatch (SAML or OIDC) ──────────────────────────────────────────

/**
 * Read the optional `idpId` query parameter. Phase 11.13 — when an
 * institution has multiple enabled IdPs, the discovery chooser sends
 * the user-agent to `/login?idpId=<row-id>` so the right protocol /
 * config is picked. Bare `/login` (no idpId) keeps the legacy
 * single-IdP behaviour: the highest-priority enabled IdP wins.
 */
function readIdpIdParam(req: Request): string | undefined {
  const raw = req.query['idpId'];
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  return raw;
}

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { institutionSlug } = req.params;
    if (!institutionSlug) {
      throw new AppError(400, 'VALIDATION_ERROR', 'institutionSlug is required');
    }
    const idp = await resolveSsoForFlow(institutionSlug, readIdpIdParam(req));

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
      // Phase 11.13 — embed `idp.id` in RelayState so the ACS resolves
      // the SAME IdP row when validating the response. Otherwise an
      // institution with multiple IdPs would always pick the highest-
      // priority row at ACS time and validate with the wrong cert.
      const url = await buildAuthnRequestUrl(institutionSlug, samlConfig, idp.id);
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
      // Phase 11.13 — record idp.id on the flow state so the callback
      // resolves the SAME IdP (different OIDC IdPs in one tenant have
      // different client_secrets — picking the wrong one fails token
      // exchange).
      const url = await buildOidcAuthorizeUrl(institutionSlug, oidcConfig, idp.id);
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
    // Phase 11.13 — read RelayState to find the EXACT IdP that issued
    // this AuthnRequest. The slug-only fallback preserves the legacy
    // single-IdP behaviour for tenants that haven't added a second row.
    const relayStateRaw = (req.body as Record<string, unknown>)?.['RelayState'];
    const relay = typeof relayStateRaw === 'string' ? parseRelayState(relayStateRaw) : null;
    const idpId = relay?.idpId;
    const idp = await resolveSsoForFlow(institutionSlug, idpId);
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

    const state = String(req.query['state'] ?? '');
    if (!state) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Missing state');
    }

    // Phase 11.13 — peek the flow record to learn which IdP issued
    // this flow. Non-destructive; `completeOidcCallback` still does
    // the GETDEL on the same key. Falls back to the highest-priority
    // IdP when no record exists or the record predates the field.
    const flow = await peekFlowState(state);
    const idp = await resolveSsoForFlow(institutionSlug, flow?.idpId);
    if (idp.protocol !== 'OIDC' || !idp.oidcIssuer || !idp.oidcClientId || !idp.oidcClientSecret) {
      throw new AppError(400, 'SSO_MISCONFIGURED', 'IdP is not configured for OIDC');
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

// ── SAML Single Logout (IdP-initiated) ─────────────────────────────────────

/**
 * IdP-initiated SAML Single Logout (Phase 11.12).
 *
 * The IdP sends a `<LogoutRequest>` via HTTP-Redirect — `SAMLRequest`,
 * `RelayState`, `SigAlg`, and `Signature` arrive as query parameters.
 * We verify the signature against the institution's stored cert, find
 * every active session for the asserted NameID (+ SessionIndex if
 * present), revoke them, and 302 the browser to the frontend's
 * post-logout landing.
 *
 * We do NOT mint a `<LogoutResponse>` back to the IdP for v1; most
 * federation IdPs treat the absence of a response as "best-effort SLO"
 * and don't error on it. A future hardening pass can add the signed
 * LogoutResponse + SAMLResponse redirect back to the IdP's SLO URL.
 *
 * Phase 11.13 — multi-IdP limitation: the IdP-initiated LogoutRequest
 * doesn't carry our `idpId`. The endpoint falls back to the highest-
 * priority enabled IdP for the slug. When an institution has multiple
 * SAML IdPs and the LogoutRequest comes from one that ISN'T the
 * primary, signature validation fails and SLO 302s to the failure
 * page. Deferred follow-up: parse the LogoutRequest's Issuer and try
 * the matching IdP first, falling back to brute-force per-IdP cert
 * validation. Most multi-IdP tenants use SAML+OIDC, not SAML+SAML, so
 * the gap rarely bites.
 *
 * Failures audit `auth.sso.slo_fail` and 302 to the frontend without
 * leaking the underlying error (signature / NameID / etc).
 */
export const samlSlo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { institutionSlug } = req.params;
    if (!institutionSlug) {
      throw new AppError(400, 'VALIDATION_ERROR', 'institutionSlug is required');
    }
    const idp = await resolveSsoForFlow(institutionSlug);
    if (idp.protocol !== 'SAML' || !idp.samlEntityId || !idp.samlSsoUrl || !idp.samlCert) {
      throw new AppError(400, 'SSO_MISCONFIGURED', 'IdP is not configured for SAML');
    }

    const samlConfig: TenantSamlConfig = {
      samlEntityId: idp.samlEntityId,
      samlSsoUrl: idp.samlSsoUrl,
      samlCert: idp.samlCert,
    };

    const originalQuery = req.url.includes('?') ? req.url.split('?')[1]! : '';

    let parsed: { nameId: string; sessionIndex?: string };
    try {
      parsed = await validateLogoutRequest(
        institutionSlug,
        samlConfig,
        req.query as Record<string, unknown>,
        originalQuery,
      );
    } catch (err) {
      logger.warn(
        { institutionSlug, err: err instanceof Error ? err.message : String(err) },
        'sso.saml.slo validation failed',
      );
      await audit(req, {
        action: 'auth.sso.slo_fail',
        entityType: 'SsoIdentityProvider',
        entityId: idp.id,
        changes: { reason: 'validation_failed' },
      });
      res.redirect(failureRedirect());
      return;
    }

    const revoked = await revokeBySamlSubject(idp.institutionId, parsed.nameId, parsed.sessionIndex);

    await audit(req, {
      action: 'auth.sso.slo_success',
      entityType: 'SsoIdentityProvider',
      entityId: idp.id,
      changes: {
        institutionId: idp.institutionId,
        samlNameId: parsed.nameId,
        ...(parsed.sessionIndex ? { samlSessionIndex: parsed.sessionIndex } : {}),
        revokedSessionCount: revoked,
      },
    });

    res.redirect(`${getFrontendBaseUrl()}/login?logged_out=sso`);
  } catch (err) {
    next(err);
  }
};
