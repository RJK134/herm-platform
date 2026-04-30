/**
 * Admin SSO endpoints (Phase 11.4) — closes the deferred ADR-0001 item:
 * "No admin UI for `SsoIdentityProvider` — operators provision IdP rows
 * via raw Prisma today."
 *
 * Surface
 *   GET    /api/admin/sso/me   — caller's institution IdP row (no secrets)
 *   PUT    /api/admin/sso/me   — upsert IdP row (encrypts secrets at rest)
 *   DELETE /api/admin/sso/me   — remove the IdP row
 *
 * Authorisation
 *   Mounted under /api/admin which already requires `INSTITUTION_ADMIN`
 *   or `SUPER_ADMIN` (see admin.router.ts). The handlers further scope
 *   reads/writes to the caller's own `institutionId` — a SUPER_ADMIN
 *   editing a tenant they're not impersonating still touches only their
 *   own institution's row, which matches the existing impersonation
 *   model (start a session as the tenant first, then administer).
 *
 * Read shape
 *   The GET response NEVER returns `samlCert` or `oidcClientSecret`.
 *   Both are sensitive even in plaintext, and after PR #63 they live
 *   encrypted in the column. Two boolean flags (`hasSamlCert`,
 *   `hasOidcClientSecret`) tell the UI whether a value is set so the
 *   form can render "•••• (configured — leave blank to keep)" instead
 *   of forcing the operator to re-enter them on every save.
 *
 * Write semantics
 *   - Body fields are strictly validated by zod.
 *   - Empty / missing `samlCert` / `oidcClientSecret` on update means
 *     "keep the existing value"; this avoids accidentally wiping a
 *     secret when the operator only intended to flip `enabled`.
 *   - Provided secrets are passed through `encryptIdpSecretsForWrite`
 *     (PR #63) — that helper is a no-op when SSO_SECRET_KEY is unset,
 *     so dev workflows keep working.
 *   - Audit-logged: every successful upsert + delete records an
 *     `admin.sso.upsert` / `admin.sso.delete` event.
 */
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { SsoProtocol, UserRole } from '@prisma/client';
import prisma from '../../utils/prisma';
import { audit } from '../../lib/audit';
import { AppError } from '../../utils/errors';
import { encryptIdpSecretsForWrite } from '../sso/sso.service';

// ── Types ──────────────────────────────────────────────────────────────────

const protocolEnum = z.enum(['SAML', 'OIDC']);
// SSO defaultRole — the role JIT-provisioned users land on. Constrained
// to the platform-side roles operators legitimately want to grant via
// SSO. SUPER_ADMIN is deliberately excluded (granting it via IdP
// assertion would be a privilege-escalation foot-gun); VENDOR_* are
// for the vendor portal, not the platform.
const roleEnum = z.enum(['VIEWER', 'EVALUATOR', 'PROCUREMENT_LEAD', 'INSTITUTION_ADMIN']);

/**
 * Update payload. All fields optional; `protocol` and `displayName`
 * are required only on first creation (enforced inside the handler).
 *
 * `samlCert` / `oidcClientSecret`: empty / undefined means "keep
 * existing"; non-empty means "replace". To clear an existing value
 * without setting a new one, pass `null`.
 */
const upsertSchema = z.object({
  protocol: protocolEnum.optional(),
  displayName: z.string().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  jitProvisioning: z.boolean().optional(),
  defaultRole: roleEnum.optional(),
  // SAML
  samlEntityId: z.string().min(1).max(500).nullable().optional(),
  samlSsoUrl: z.string().url().nullable().optional(),
  samlCert: z.string().nullable().optional(),
  // OIDC
  oidcIssuer: z.string().url().nullable().optional(),
  oidcClientId: z.string().min(1).max(500).nullable().optional(),
  oidcClientSecret: z.string().nullable().optional(),
});

interface IdpReadShape {
  id: string;
  institutionId: string;
  protocol: SsoProtocol;
  displayName: string;
  enabled: boolean;
  jitProvisioning: boolean;
  defaultRole: UserRole;
  samlEntityId: string | null;
  samlSsoUrl: string | null;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  hasSamlCert: boolean;
  hasOidcClientSecret: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toReadShape(row: {
  id: string;
  institutionId: string;
  protocol: SsoProtocol;
  displayName: string;
  enabled: boolean;
  jitProvisioning: boolean;
  defaultRole: UserRole;
  samlEntityId: string | null;
  samlSsoUrl: string | null;
  samlCert: string | null;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  oidcClientSecret: string | null;
  createdAt: Date;
  updatedAt: Date;
}): IdpReadShape {
  return {
    id: row.id,
    institutionId: row.institutionId,
    protocol: row.protocol,
    displayName: row.displayName,
    enabled: row.enabled,
    jitProvisioning: row.jitProvisioning,
    defaultRole: row.defaultRole,
    samlEntityId: row.samlEntityId,
    samlSsoUrl: row.samlSsoUrl,
    oidcIssuer: row.oidcIssuer,
    oidcClientId: row.oidcClientId,
    hasSamlCert: !!row.samlCert && row.samlCert.length > 0,
    hasOidcClientSecret: !!row.oidcClientSecret && row.oidcClientSecret.length > 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function callerInstitutionId(req: Request): string {
  const user = req.user;
  if (!user || !user.institutionId) {
    throw new AppError(403, 'AUTHORIZATION_ERROR', 'Authenticated user has no institutionId');
  }
  return user.institutionId;
}

// ── GET /api/admin/sso/me ──────────────────────────────────────────────────

export const readMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const institutionId = callerInstitutionId(req);
    const row = await prisma.ssoIdentityProvider.findUnique({ where: { institutionId } });
    if (!row) {
      res.json({ success: true, data: null });
      return;
    }
    res.json({ success: true, data: toReadShape(row) });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/admin/sso/me ──────────────────────────────────────────────────

export const upsertMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const institutionId = callerInstitutionId(req);
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.errors[0]?.message ?? 'Invalid payload',
      );
    }
    const input = parsed.data;
    const existing = await prisma.ssoIdentityProvider.findUnique({ where: { institutionId } });

    // First-create requires protocol + displayName so the row is
    // never persisted in a half-state. Updates leave them optional.
    if (!existing) {
      if (!input.protocol || !input.displayName) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'protocol and displayName are required when creating an SSO IdP row.',
        );
      }
    }

    // "Keep existing secret" semantics: an undefined / empty-string
    // value means "leave the column alone". Explicit null clears it.
    function keepOrReplace<K extends 'samlCert' | 'oidcClientSecret'>(
      key: K,
    ): { update: { [P in K]?: string | null }; create: string | null } {
      const v = input[key];
      if (v === undefined) return { update: {}, create: null };
      if (v === null || v === '') return { update: { [key]: null } as never, create: null };
      return { update: { [key]: v } as never, create: v };
    }

    const samlCertOp = keepOrReplace('samlCert');
    const oidcSecretOp = keepOrReplace('oidcClientSecret');

    // Encrypt-at-rest before persisting. `encryptIdpSecretsForWrite`
    // is idempotent on already-encrypted values and a no-op on empty,
    // so calling it on every write is safe.
    const encUpdate = encryptIdpSecretsForWrite({
      ...samlCertOp.update,
      ...oidcSecretOp.update,
    });
    const encCreate = encryptIdpSecretsForWrite({
      samlCert: samlCertOp.create,
      oidcClientSecret: oidcSecretOp.create,
    });

    const row = await prisma.ssoIdentityProvider.upsert({
      where: { institutionId },
      update: {
        ...(input.protocol !== undefined && { protocol: input.protocol }),
        ...(input.displayName !== undefined && { displayName: input.displayName }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        ...(input.jitProvisioning !== undefined && { jitProvisioning: input.jitProvisioning }),
        ...(input.defaultRole !== undefined && { defaultRole: input.defaultRole }),
        ...(input.samlEntityId !== undefined && { samlEntityId: input.samlEntityId }),
        ...(input.samlSsoUrl !== undefined && { samlSsoUrl: input.samlSsoUrl }),
        ...(input.oidcIssuer !== undefined && { oidcIssuer: input.oidcIssuer }),
        ...(input.oidcClientId !== undefined && { oidcClientId: input.oidcClientId }),
        ...encUpdate,
      },
      create: {
        institutionId,
        protocol: input.protocol!,
        displayName: input.displayName!,
        enabled: input.enabled ?? false,
        jitProvisioning: input.jitProvisioning ?? true,
        defaultRole: input.defaultRole ?? 'VIEWER',
        samlEntityId: input.samlEntityId ?? null,
        samlSsoUrl: input.samlSsoUrl ?? null,
        oidcIssuer: input.oidcIssuer ?? null,
        oidcClientId: input.oidcClientId ?? null,
        samlCert: encCreate.samlCert ?? null,
        oidcClientSecret: encCreate.oidcClientSecret ?? null,
      },
    });

    await audit(req, {
      action: existing ? 'admin.sso.update' : 'admin.sso.create',
      entityType: 'SsoIdentityProvider',
      entityId: row.id,
      changes: {
        institutionId,
        protocol: row.protocol,
        enabled: row.enabled,
        jitProvisioning: row.jitProvisioning,
        // We deliberately do not include the secret values themselves
        // in the audit changes. Flag whether they were touched instead.
        samlCertTouched: input.samlCert !== undefined,
        oidcClientSecretTouched: input.oidcClientSecret !== undefined,
      },
    });

    res.json({ success: true, data: toReadShape(row) });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/admin/sso/me ───────────────────────────────────────────────

export const deleteMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const institutionId = callerInstitutionId(req);
    const existing = await prisma.ssoIdentityProvider.findUnique({ where: { institutionId } });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'No SSO IdP row to delete.');
    }
    await prisma.ssoIdentityProvider.delete({ where: { institutionId } });
    await audit(req, {
      action: 'admin.sso.delete',
      entityType: 'SsoIdentityProvider',
      entityId: existing.id,
      changes: { institutionId, protocol: existing.protocol },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
