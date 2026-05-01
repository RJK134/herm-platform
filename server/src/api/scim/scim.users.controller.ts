/**
 * SCIM 2.0 Users resource (RFC 7644 §3, RFC 7643 §4.1).
 *
 *   GET    /scim/v2/Users                  List/query (filter + pagination)
 *   GET    /scim/v2/Users/:id              Read one
 *   POST   /scim/v2/Users                  Provision
 *   PUT    /scim/v2/Users/:id              Replace (full update)
 *   DELETE /scim/v2/Users/:id              De-provision (soft-delete)
 *
 *   PATCH                                  501 Not Implemented (v1 leaves
 *                                          partial updates for v2)
 *
 * Tenant scoping
 *   Every request is scoped to `req.apiUser.institutionId`. A SCIM
 *   client cannot list, read, or write users in another institution
 *   — the institution identifier comes from the API key, never from
 *   the request body or URL.
 *
 * Soft-delete
 *   DELETE writes `deletedAt = now()` and scrubs PII (email →
 *   `<id>@deleted.invalid`, name → "[deleted user]") so the row obeys
 *   the same retention path as the GDPR right-to-erasure path that
 *   landed in PR #70. The retention scheduler hard-deletes after the
 *   grace window. SCIM clients see 204 (RFC 7644 §3.6) and a
 *   subsequent GET returns 404.
 */
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../utils/prisma';
import { audit } from '../../lib/audit';
import { sendScimError, sendScimZodError } from './scim.errors';
import { userToScim, joinScimName, pickPrimaryEmail, USER_RESOURCE_SCHEMA } from './scim.mappers';
import { parseFilter } from './scim.filter';

const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

function institutionId(req: Request): string | null {
  return req.apiUser?.institutionId ?? null;
}

function baseUrl(req: Request): string {
  // Prefer the proxy-forwarded scheme/host so SCIM `meta.location`
  // points at the externally-reachable URL even behind a load balancer.
  const proto = req.get('x-forwarded-proto') ?? req.protocol;
  const host = req.get('x-forwarded-host') ?? req.get('host') ?? '';
  return `${proto}://${host}`;
}

const scimUserCreateSchema = z.object({
  schemas: z.array(z.string()).optional(),
  userName: z.string().min(3).max(255),
  externalId: z.string().max(255).optional(),
  name: z
    .object({
      givenName: z.string().optional(),
      familyName: z.string().optional(),
      formatted: z.string().optional(),
    })
    .optional(),
  emails: z
    .array(
      z.object({
        value: z.string().email(),
        primary: z.boolean().optional(),
        type: z.string().optional(),
      }),
    )
    .optional(),
  active: z.boolean().optional(),
});

const scimUserReplaceSchema = scimUserCreateSchema; // PUT shape == POST shape

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const inst = institutionId(req);
    if (!inst) {
      sendScimError(res, { status: 401, detail: 'API key required' });
      return;
    }
    const startIndex = Math.max(1, Number.parseInt(String(req.query['startIndex'] ?? '1'), 10) || 1);
    const count = Math.min(
      MAX_PAGE_SIZE,
      Math.max(0, Number.parseInt(String(req.query['count'] ?? String(DEFAULT_PAGE_SIZE)), 10) || DEFAULT_PAGE_SIZE),
    );
    const filterRaw = typeof req.query['filter'] === 'string' ? (req.query['filter'] as string) : undefined;

    let extraWhere: Record<string, unknown> = {};
    if (filterRaw) {
      const parsed = parseFilter(filterRaw);
      if (!parsed) {
        sendScimError(res, {
          status: 400,
          detail: `unsupported filter: ${filterRaw}`,
          scimType: 'invalidFilter',
        });
        return;
      }
      if (parsed.attribute === 'userName') extraWhere = { email: parsed.value.toLowerCase() };
      else if (parsed.attribute === 'externalId') extraWhere = { externalId: parsed.value };
      else if (parsed.attribute === 'active') {
        extraWhere = parsed.value ? { deletedAt: null } : { deletedAt: { not: null } };
      }
    }

    const where = { institutionId: inst, ...(filterRaw ? extraWhere : { deletedAt: null }) };
    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip: startIndex - 1,
        take: count,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const url = baseUrl(req);
    res.type('application/scim+json').json({
      schemas: [SCIM_LIST_SCHEMA],
      totalResults: total,
      itemsPerPage: rows.length,
      startIndex,
      Resources: rows.map((r) => userToScim(r, url)),
    });
  } catch (err) {
    next(err);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const inst = institutionId(req);
    if (!inst) {
      sendScimError(res, { status: 401, detail: 'API key required' });
      return;
    }
    const id = String(req.params['id'] ?? '');
    const user = await prisma.user.findFirst({
      where: { id, institutionId: inst, deletedAt: null },
    });
    if (!user) {
      sendScimError(res, { status: 404, detail: `User ${id} not found` });
      return;
    }
    res.type('application/scim+json').json(userToScim(user, baseUrl(req)));
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const inst = institutionId(req);
    if (!inst) {
      sendScimError(res, { status: 401, detail: 'API key required' });
      return;
    }
    const parsed = scimUserCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendScimZodError(res, parsed.error);
      return;
    }
    const data = parsed.data;
    const email = (pickPrimaryEmail(data.emails) ?? data.userName).toLowerCase();
    const name = joinScimName(data.name) || email.split('@')[0]!;

    // Uniqueness check: a User row with this email anywhere in the
    // platform blocks creation. We do NOT distinguish "in this
    // institution" vs "in another institution" so an outside SCIM
    // client cannot probe other tenants' user lists.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      sendScimError(res, {
        status: 409,
        detail: `userName "${data.userName}" is already registered`,
        scimType: 'uniqueness',
      });
      return;
    }

    // externalId uniqueness inside the institution (composite-unique
    // schema constraint). A different institution can have the same
    // externalId; same institution cannot.
    if (data.externalId) {
      const externalDup = await prisma.user.findUnique({
        where: { institutionId_externalId: { institutionId: inst, externalId: data.externalId } },
      });
      if (externalDup) {
        sendScimError(res, {
          status: 409,
          detail: `externalId "${data.externalId}" is already in use in this institution`,
          scimType: 'uniqueness',
        });
        return;
      }
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        institutionId: inst,
        externalId: data.externalId ?? null,
        // SCIM-provisioned accounts have no password; password login is
        // disabled. The IdP / SCIM client owns auth.
        passwordHash: '',
        passwordLoginDisabled: true,
        // Some clients expect to create-as-disabled; honour `active=false`.
        deletedAt: data.active === false ? new Date() : null,
      },
    });

    await audit(undefined, {
      action: 'scim.user.create',
      entityType: 'User',
      entityId: user.id,
      userId: null,
      changes: {
        institutionId: inst,
        email,
        externalId: user.externalId,
        apiKeyId: req.apiUser?.id ?? null,
      },
    });

    res.status(201).type('application/scim+json').json(userToScim(user, baseUrl(req)));
  } catch (err) {
    next(err);
  }
}

export async function replaceUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const inst = institutionId(req);
    if (!inst) {
      sendScimError(res, { status: 401, detail: 'API key required' });
      return;
    }
    const id = String(req.params['id'] ?? '');
    const existing = await prisma.user.findFirst({
      where: { id, institutionId: inst },
    });
    if (!existing) {
      sendScimError(res, { status: 404, detail: `User ${id} not found` });
      return;
    }
    const parsed = scimUserReplaceSchema.safeParse(req.body);
    if (!parsed.success) {
      sendScimZodError(res, parsed.error);
      return;
    }
    const data = parsed.data;
    const newEmail = (pickPrimaryEmail(data.emails) ?? data.userName).toLowerCase();
    const newName = joinScimName(data.name) || existing.name;

    // If the email changed, re-check uniqueness across the platform.
    if (newEmail !== existing.email) {
      const collision = await prisma.user.findUnique({ where: { email: newEmail } });
      if (collision && collision.id !== existing.id) {
        sendScimError(res, {
          status: 409,
          detail: `userName "${data.userName}" is already registered`,
          scimType: 'uniqueness',
        });
        return;
      }
    }
    if (data.externalId && data.externalId !== existing.externalId) {
      const dup = await prisma.user.findUnique({
        where: { institutionId_externalId: { institutionId: inst, externalId: data.externalId } },
      });
      if (dup && dup.id !== existing.id) {
        sendScimError(res, {
          status: 409,
          detail: `externalId "${data.externalId}" is already in use in this institution`,
          scimType: 'uniqueness',
        });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        email: newEmail,
        name: newName,
        externalId: data.externalId ?? null,
        // active = false ⇒ soft-delete (or keep soft-deleted); active = true ⇒ revive
        deletedAt:
          data.active === false
            ? existing.deletedAt ?? new Date()
            : data.active === true
              ? null
              : existing.deletedAt,
      },
    });

    await audit(undefined, {
      action: 'scim.user.replace',
      entityType: 'User',
      entityId: updated.id,
      userId: null,
      changes: {
        institutionId: inst,
        emailChanged: newEmail !== existing.email,
        externalIdChanged: (data.externalId ?? null) !== existing.externalId,
        activeChanged: existing.deletedAt !== updated.deletedAt,
        apiKeyId: req.apiUser?.id ?? null,
      },
    });

    res.type('application/scim+json').json(userToScim(updated, baseUrl(req)));
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const inst = institutionId(req);
    if (!inst) {
      sendScimError(res, { status: 401, detail: 'API key required' });
      return;
    }
    const id = String(req.params['id'] ?? '');
    const existing = await prisma.user.findFirst({
      where: { id, institutionId: inst, deletedAt: null },
    });
    if (!existing) {
      sendScimError(res, { status: 404, detail: `User ${id} not found` });
      return;
    }

    // Soft-delete + scrub PII, mirroring the GDPR right-to-erasure path
    // in `gdpr.controller.ts`. The retention scheduler hard-deletes
    // after the grace window.
    const now = new Date();
    const scrubbedEmail = `${now.toISOString()}+${existing.id}@deleted.invalid`;
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        deletedAt: now,
        email: scrubbedEmail,
        name: '[deleted user]',
        passwordHash: '',
        passwordLoginDisabled: true,
        mfaSecret: null,
        mfaEnabledAt: null,
      },
    });

    await audit(undefined, {
      action: 'scim.user.delete',
      entityType: 'User',
      entityId: existing.id,
      userId: null,
      changes: {
        institutionId: inst,
        externalId: existing.externalId,
        apiKeyId: req.apiUser?.id ?? null,
      },
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export function patchUserNotImplemented(_req: Request, res: Response): void {
  sendScimError(res, {
    status: 501,
    detail: 'PATCH is not implemented in this version. Use PUT for replace semantics.',
  });
}
