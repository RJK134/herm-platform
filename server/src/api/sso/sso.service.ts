/**
 * Shared SSO post-assertion logic (Phase 10.10).
 *
 * Both the SAML ACS and the OIDC callback land here once they have a
 * verified `{ email, name }` from the IdP. This file owns:
 *
 *   - Resolving the institution + its enabled IdP row (with the
 *     subscription, so we can enforce Q7 enterprise-tier gating).
 *   - JIT provisioning when the email is unknown.
 *   - Q3 account collision: when the email is already registered with
 *     a password, link the IdP identity to that User row and disable
 *     password login on it. Audit-log `auth.sso.account_linked`.
 *   - Q10 MFA bypass: SSO logins skip the HERM-side TOTP challenge.
 *     The IdP is the source of MFA truth. Mint a session JWT directly,
 *     even if the User has `mfaEnabledAt`.
 *   - Q4 lockout bypass: SSO failures don't engage the password
 *     lockout (this is enforced by the controllers — they never call
 *     `recordFailure`).
 *
 * Tier-gating (Q7) lives here as a service-level check rather than a
 * route-middleware check because SSO routes are by construction
 * unauthenticated; the standard `requirePaidTier` middleware can't
 * apply (it reads `req.user`). The institution's tier is the right
 * subject — an enterprise institution with a free-tier user signing
 * in via SSO is allowed; the customer is paying for the SSO feature.
 */
import type { Request } from 'express';
import type { SsoIdentityProvider, Institution, Subscription, User, UserRole } from '@prisma/client';
import prisma from '../../utils/prisma';
import { generateToken, type JwtPayload } from '../../middleware/auth';
import { resolveEffectiveTier } from '../auth/auth.service';
import { audit } from '../../lib/audit';
import { AppError } from '../../utils/errors';
import { logger } from '../../lib/logger';
import { decryptSecret, encryptSecret } from '../../lib/secret-cipher';

export type ResolvedIdp = SsoIdentityProvider & {
  institution: Institution & { subscription: Subscription | null };
};

/**
 * Look up the IdP for a slug. Returns 404 with the same opaque code
 * the discovery endpoint uses, so an unauthenticated probe can't tell
 * "this slug doesn't exist" from "SSO disabled" from "tier insufficient".
 *
 * Q7 enforcement: rejects if the institution's effective tier isn't
 * Enterprise. The effective tier comes from `resolveEffectiveTier`,
 * which globally promotes every institution to Enterprise when the
 * `DEV_UNLOCK_ALL_TIERS` env flag is set — useful for local SSO
 * testing without provisioning an Enterprise subscription. There is
 * no per-user / SUPER_ADMIN bypass here; the gate is institution-tier
 * because the caller is anonymous on this code path.
 */
export async function resolveSsoForFlow(institutionSlug: string): Promise<ResolvedIdp> {
  const institution = await prisma.institution.findUnique({
    where: { slug: institutionSlug },
    include: {
      subscription: true,
      ssoProvider: true,
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
      'SSO is not configured for this institution.',
    );
  }
  const tier = resolveEffectiveTier(
    institution.subscription?.tier?.toLowerCase() ?? 'free',
  );
  if (tier !== 'enterprise') {
    // Same opaque 404 to avoid leaking tier state across the boundary.
    // The institution admin who wired SSO already knows their plan;
    // an outside probe doesn't need to.
    logger.warn(
      { institutionId: institution.id, tier },
      'sso flow rejected: institution not on enterprise tier',
    );
    throw new AppError(
      404,
      'SSO_NOT_CONFIGURED',
      'SSO is not configured for this institution.',
    );
  }
  // Decrypt the at-rest secrets here — once — so every downstream caller
  // (controllers, saml.ts, oidc.ts) operates on plaintext like before.
  // `decryptSecret` is a no-op for legacy rows that haven't been encrypted
  // yet, so this is a backwards-compatible upgrade.
  let samlCert: string | null;
  let oidcClientSecret: string | null;
  try {
    samlCert = decryptSecret(institution.ssoProvider.samlCert) ?? null;
    oidcClientSecret = decryptSecret(institution.ssoProvider.oidcClientSecret) ?? null;
  } catch (err) {
    logger.error(
      {
        institutionId: institution.id,
        idpId: institution.ssoProvider.id,
        err: err instanceof Error ? err.message : String(err),
      },
      'sso flow rejected: secret decryption failed',
    );
    // Same opaque 404 — the operator's IdP row exists, but we cannot
    // load it. Surfacing a distinct error code here would tell an
    // outside probe that an encrypted row exists.
    throw new AppError(
      404,
      'SSO_NOT_CONFIGURED',
      'SSO is not configured for this institution.',
    );
  }
  return {
    ...institution.ssoProvider,
    samlCert,
    oidcClientSecret,
    institution: {
      ...institution,
      subscription: institution.subscription,
    },
  };
}

/**
 * Helper for the SSO admin write path (currently Prisma-direct;
 * a future admin UI in PR D will call this). Takes the
 * about-to-be-written values and returns them with `samlCert` and
 * `oidcClientSecret` encrypted under `SSO_SECRET_KEY`. Other fields
 * pass through untouched.
 *
 * Idempotent: re-encrypting an already-encrypted value is a no-op
 * (`encryptSecret` short-circuits on the prefix), so a save that
 * round-trips through a read → write path stays safe.
 */
export function encryptIdpSecretsForWrite<
  T extends { samlCert?: string | null; oidcClientSecret?: string | null },
>(input: T): T {
  const out = { ...input };
  if (typeof input.samlCert === 'string' && input.samlCert.length > 0) {
    out.samlCert = encryptSecret(input.samlCert);
  }
  if (typeof input.oidcClientSecret === 'string' && input.oidcClientSecret.length > 0) {
    out.oidcClientSecret = encryptSecret(input.oidcClientSecret);
  }
  return out;
}

interface AssertedIdentity {
  email: string;
  name?: string;
  /**
   * Phase 11.12 — when the assertion arrived via SAML, propagate the
   * NameID + SessionIndex so the session-store row can be indexed by
   * them. The IdP-initiated LogoutRequest will carry the same values.
   */
  samlNameId?: string;
  samlSessionIndex?: string;
}

/**
 * JIT-provision or link the User row for an asserted SSO identity, then
 * mint a session JWT.
 *
 * Four branches:
 *   1. Unknown email + idp.jitProvisioning=true → create User with
 *      `defaultRole` and the institution from the IdP row.
 *   2. Unknown email + idp.jitProvisioning=false → 403, the institution
 *      requires pre-provisioning.
 *   3. Existing email + DIFFERENT institutionId → REFUSED with 403 and
 *      audit `auth.sso.cross_institution_blocked`. Cross-tenant
 *      takeover prevention: an Enterprise admin who configures their
 *      IdP to assert another institution's user email cannot link or
 *      impersonate that user. Legitimate cross-institution moves
 *      require admin action (delete or rename the source User row).
 *   4. Existing email + SAME institutionId → flip `passwordLoginDisabled`
 *      to true (Q3) and audit `auth.sso.account_linked` if it wasn't
 *      already disabled.
 */
export async function completeSsoSignIn(
  req: Request,
  idp: ResolvedIdp,
  assertion: AssertedIdentity,
): Promise<string> {
  const email = assertion.email.toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    include: { institution: { include: { subscription: true } } },
  });

  let user: User & {
    institution: Institution & { subscription: Subscription | null };
  };

  if (!existing) {
    if (!idp.jitProvisioning) {
      // The IdP successfully authenticated this user, but the
      // institution operator turned off auto-provisioning — refuse
      // to create the row and audit the rejection.
      await audit(req, {
        action: 'auth.sso.fail',
        entityType: 'SsoIdentityProvider',
        entityId: idp.id,
        changes: {
          email,
          reason: 'jit_disabled',
          institutionId: idp.institutionId,
        },
      });
      throw new AppError(
        403,
        'AUTHORIZATION_ERROR',
        'This account is not provisioned. Contact your administrator.',
      );
    }

    const created = await prisma.user.create({
      data: {
        email,
        name: assertion.name ?? email.split('@')[0]!,
        passwordHash: '', // SSO-only; password login disabled by default
        passwordLoginDisabled: true,
        role: idp.defaultRole as UserRole,
        institutionId: idp.institutionId,
      },
      include: { institution: { include: { subscription: true } } },
    });
    user = created;

    await audit(req, {
      action: 'auth.sso.jit_provisioned',
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      changes: {
        email,
        institutionId: idp.institutionId,
        protocol: idp.protocol,
        idpId: idp.id,
      },
    });
  } else {
    // SECURITY: cross-institution rejection.
    // The user lookup is by email (the only identifier the IdP gives
    // us), but `User.email` is globally unique — so a malicious
    // Enterprise admin who configures their IdP to assert a different
    // institution's user email would otherwise let us link THAT
    // user's account to THEIR IdP and mint a session JWT for them.
    // Refuse outright when the asserted email belongs to a User in a
    // different institution. The legitimate case (a user who genuinely
    // moved institutions) is handled by an admin: hard-delete or
    // rename the old User row first, then SSO from the new tenant.
    if (existing.institutionId !== idp.institutionId) {
      await audit(req, {
        action: 'auth.sso.cross_institution_blocked',
        entityType: 'User',
        entityId: existing.id,
        userId: null,
        changes: {
          email,
          existingInstitutionId: existing.institutionId,
          idpInstitutionId: idp.institutionId,
          idpId: idp.id,
          protocol: idp.protocol,
        },
      });
      throw new AppError(
        403,
        'AUTHORIZATION_ERROR',
        'This account belongs to a different institution.',
      );
    }

    // Q3 — existing same-institution account by email. Link this IdP
    // identity by flipping `passwordLoginDisabled` to true (idempotent
    // — if it was already true, no-op-but-still-mint-the-token).
    // Audit only on the boundary.
    if (!existing.passwordLoginDisabled) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordLoginDisabled: true },
      });
      await audit(req, {
        action: 'auth.sso.account_linked',
        entityType: 'User',
        entityId: existing.id,
        userId: existing.id,
        changes: {
          email,
          institutionId: existing.institutionId,
          idpId: idp.id,
          protocol: idp.protocol,
        },
      });
    }
    user = { ...existing, passwordLoginDisabled: true };
  }

  // Q10 — SSO bypasses HERM-side MFA. Mint a session token directly
  // even if user.mfaEnabledAt is set. Documented in the customer
  // onboarding guide; the IdP enforces its own MFA policy.
  const tier = resolveEffectiveTier(
    user.institution.subscription?.tier?.toLowerCase() ?? 'free',
  );
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    institutionId: user.institutionId,
    institutionName: user.institution.name,
    tier,
  };
  // Phase 11.12 — propagate SAML NameID + SessionIndex into the
  // session-store row (via generateToken's optional second arg) so
  // an IdP-initiated LogoutRequest can find this session by subject.
  // Falls through cleanly for OIDC sessions (the values are undefined).
  const token = generateToken(payload, {
    ...(assertion.samlNameId ? { samlNameId: assertion.samlNameId } : {}),
    ...(assertion.samlSessionIndex ? { samlSessionIndex: assertion.samlSessionIndex } : {}),
  });

  await audit(req, {
    action: 'auth.sso.success',
    entityType: 'User',
    entityId: user.id,
    userId: user.id,
    changes: {
      protocol: idp.protocol,
      idpId: idp.id,
      institutionId: idp.institutionId,
      // Note explicitly that the MFA gate was bypassed so a security
      // review can attribute the absence of a TOTP step.
      mfaBypassed: user.mfaEnabledAt !== null,
    },
  });

  return token;
}
