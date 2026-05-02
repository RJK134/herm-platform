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
import { invalidateOidcConfigCacheByKey } from '../sso/oidc';

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

function requireSuperAdmin(req: Request): void {
  if (req.user?.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'AUTHORIZATION_ERROR', 'SUPER_ADMIN role required');
  }
}

/**
 * Shared upsert path used by both the institution-scoped (`/me`) and
 * the SUPER_ADMIN cross-institution (`/institutions/:institutionId`)
 * endpoints. The only thing the two callers disagree on is which
 * institutionId to write to; everything else (validation,
 * keep-or-replace secret semantics, encrypt-at-rest, audit shape) is
 * identical.
 */
async function upsertForInstitution(
  req: Request,
  institutionId: string,
  rawInput: unknown,
): Promise<IdpReadShape> {
  const parsed = upsertSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      parsed.error.errors[0]?.message ?? 'Invalid payload',
    );
  }
  const input = parsed.data;
  // Phase 11.13 — admin operates on the institution's PRIMARY IdP
  // (lowest priority, then earliest createdAt). Single-IdP tenants are
  // unchanged; multi-IdP tenants would manage additional rows via a
  // future row-id-based admin endpoint (deferred). The existence
  // check + upsert pattern is replaced by an explicit findFirst +
  // create-or-update split because Prisma's upsert needs a unique
  // where clause and `institutionId` is no longer unique.
  const existing = await prisma.ssoIdentityProvider.findFirst({
    where: { institutionId },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });

  if (!existing) {
    if (!input.protocol || !input.displayName) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'protocol and displayName are required when creating an SSO IdP row.',
      );
    }
  }

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

  const encUpdate = encryptIdpSecretsForWrite({
    ...samlCertOp.update,
    ...oidcSecretOp.update,
  });
  const encCreate = encryptIdpSecretsForWrite({
    samlCert: samlCertOp.create,
    oidcClientSecret: oidcSecretOp.create,
  });

  const row = existing
    ? await prisma.ssoIdentityProvider.update({
        where: { id: existing.id },
        data: {
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
      })
    : await prisma.ssoIdentityProvider.create({
        data: {
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

  // Phase 11.15 (P11) — invalidate the in-process OIDC discovery-config
  // cache when an OIDC IdP's credentials change. The cached
  // `Configuration` embeds the client_secret at discovery time, so a
  // rotation that doesn't kick this cache leaves token exchange using
  // the stale secret for up to TTL_MS (1h) — operationally surprising
  // and only visible to users as the opaque "sso_failed" banner.
  //
  // We invalidate BOTH the old key (read from the pre-write `existing`
  // row, captured before the update) AND the new key (read from the
  // post-write `row`). When neither issuer nor clientId changed the
  // two collapse to a single delete; when either rotated, the old
  // cache entry would otherwise survive untouched. The new-key
  // invalidation is defensive — no other path populates this cache
  // outside the SSO flow itself, but this guarantees a rotation
  // forces re-discovery on the very next sign-in regardless of any
  // background work.
  //
  // Creates (existing === null) skip the old-key invalidation: the
  // cache can't have an entry yet, since the row didn't exist.
  if (row.protocol === 'OIDC') {
    if (existing) {
      invalidateOidcConfigCacheByKey({
        oidcIssuer: existing.oidcIssuer,
        oidcClientId: existing.oidcClientId,
      });
    }
    invalidateOidcConfigCacheByKey({
      oidcIssuer: row.oidcIssuer,
      oidcClientId: row.oidcClientId,
    });
  }

  await audit(req, {
    action: existing ? 'admin.sso.update' : 'admin.sso.create',
    entityType: 'SsoIdentityProvider',
    entityId: row.id,
    changes: {
      institutionId,
      protocol: row.protocol,
      enabled: row.enabled,
      jitProvisioning: row.jitProvisioning,
      samlCertTouched: input.samlCert !== undefined,
      oidcClientSecretTouched: input.oidcClientSecret !== undefined,
    },
  });

  return toReadShape(row);
}

// ── GET /api/admin/sso/me ──────────────────────────────────────────────────

export const readMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const institutionId = callerInstitutionId(req);
    // Phase 11.13 — surface the PRIMARY IdP for this institution
    // (lowest priority, then earliest createdAt). Multi-IdP tenants
    // will get a list endpoint in a follow-up.
    const row = await prisma.ssoIdentityProvider.findFirst({
      where: { institutionId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
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
    const data = await upsertForInstitution(req, institutionId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/admin/sso/me ───────────────────────────────────────────────

async function deleteForInstitution(req: Request, institutionId: string): Promise<void> {
  // Phase 11.13 — delete the PRIMARY IdP only. Multi-IdP tenants would
  // need to delete additional rows via a future row-id-based endpoint.
  const existing = await prisma.ssoIdentityProvider.findFirst({
    where: { institutionId },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'No SSO IdP row to delete.');
  }
  await prisma.ssoIdentityProvider.delete({ where: { id: existing.id } });
  // Phase 11.15 (P11) — drop the discovery-config cache entry for the
  // deleted IdP. Otherwise the cached Configuration (with its embedded
  // clientSecret) would linger for up to TTL_MS even though the row
  // is gone; benign in steady state but a foot-gun if the same
  // {issuer, clientId} is recreated within the TTL window with a
  // different secret.
  if (existing.protocol === 'OIDC') {
    invalidateOidcConfigCacheByKey({
      oidcIssuer: existing.oidcIssuer,
      oidcClientId: existing.oidcClientId,
    });
  }
  await audit(req, {
    action: 'admin.sso.delete',
    entityType: 'SsoIdentityProvider',
    entityId: existing.id,
    changes: { institutionId, protocol: existing.protocol },
  });
}

export const deleteMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const institutionId = callerInstitutionId(req);
    await deleteForInstitution(req, institutionId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// ── SUPER_ADMIN cross-institution panel (Phase 11.8) ───────────────────────
//
// The /me endpoints are scoped to the caller's own institutionId.
// SUPER_ADMINs need to administer IdP rows across every institution,
// which the impersonation-first workflow today makes awkward (start a
// session as the tenant, then administer). These endpoints land that
// directly on the SUPER_ADMIN console.
//
//   GET    /api/admin/sso/all                       — list every IdP + its institution
//   GET    /api/admin/sso/institutions/:id          — read one IdP by institutionId
//   PUT    /api/admin/sso/institutions/:id          — upsert one IdP by institutionId
//   DELETE /api/admin/sso/institutions/:id          — delete one IdP by institutionId
//
// All four require role === 'SUPER_ADMIN' (the standard admin guard
// that lets INSTITUTION_ADMINs through is too lax — they must not be
// able to peek at or edit other tenants' IdPs).

interface IdpListEntry extends IdpReadShape {
  institutionName: string;
  institutionSlug: string;
}

export const readAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    requireSuperAdmin(req);
    const rows = await prisma.ssoIdentityProvider.findMany({
      include: { institution: { select: { name: true, slug: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    const data: IdpListEntry[] = rows.map((row) => ({
      ...toReadShape(row),
      institutionName: row.institution.name,
      institutionSlug: row.institution.slug,
    }));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const readByInstitution = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    requireSuperAdmin(req);
    const institutionId = req.params['institutionId'];
    if (!institutionId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'institutionId is required');
    }
    // Phase 11.13 — return the PRIMARY IdP row. Multi-IdP tenants
    // get the full set via a future list-by-institution endpoint.
    const row = await prisma.ssoIdentityProvider.findFirst({
      where: { institutionId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: { institution: { select: { name: true, slug: true } } },
    });
    if (!row) {
      res.json({ success: true, data: null });
      return;
    }
    const data: IdpListEntry = {
      ...toReadShape(row),
      institutionName: row.institution.name,
      institutionSlug: row.institution.slug,
    };
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const upsertByInstitution = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    requireSuperAdmin(req);
    const institutionId = req.params['institutionId'];
    if (!institutionId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'institutionId is required');
    }
    // Confirm the institution exists before touching the IdP table —
    // a typo in the path would otherwise create an orphaned row.
    const inst = await prisma.institution.findUnique({ where: { id: institutionId } });
    if (!inst) {
      throw new AppError(404, 'NOT_FOUND', 'Institution not found');
    }
    const data = await upsertForInstitution(req, institutionId, req.body);
    // Return the enriched shape (matching readAll / readByInstitution) so
    // the SUPER_ADMIN edit page keeps the institutionName/Slug after a
    // save or secret-clear. Prefer this over re-querying the row with an
    // include — `inst` is already in hand from the existence check above.
    const enrichedData: IdpListEntry = {
      ...data,
      institutionName: inst.name,
      institutionSlug: inst.slug,
    };
    res.json({ success: true, data: enrichedData });
  } catch (err) {
    next(err);
  }
};

export const deleteByInstitution = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    requireSuperAdmin(req);
    const institutionId = req.params['institutionId'];
    if (!institutionId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'institutionId is required');
    }
    await deleteForInstitution(req, institutionId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
