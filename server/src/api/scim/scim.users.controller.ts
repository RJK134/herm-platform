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
import { getSpBaseUrl } from '../../lib/sso-config';
import { sendScimError, sendScimZodError } from './scim.errors';
import { userToScim, joinScimName, pickPrimaryEmail } from './scim.mappers';
import { parseFilter } from './scim.filter';

const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

function institutionId(req: Request): string | null {
  return req.apiUser?.institutionId ?? null;
}

/**
 * Public base URL for SCIM `meta.location`. Sourced from `SP_BASE_URL`
 * env (the same trusted value SAML/OIDC use). Previously trusted
 * `x-forwarded-proto`/`x-forwarded-host` headers, which can be spoofed
 * by a direct client when the app does not configure Express
 * `trust proxy` — so a malicious caller could inject host/proto into
 * discovery metadata. Sourcing from env removes the attack surface.
 */
function baseUrl(_req: Request): string {
  return getSpBaseUrl();
}

/**
 * Tombstone an email address for soft-delete. Format mirrors the
 * GDPR right-to-erasure path in `gdpr.controller.ts`:
 * `deleted+<id>@deleted.invalid`. The `.invalid` TLD is reserved by
 * RFC 2606 so it can never collide with a real domain. The local-part
 * is RFC 5322-safe (no `:` characters that earlier `now.toISOString()`
 * variants produced — those would have failed `zod.string().email()`).
 */
function tombstoneEmail(userId: string): string {
  return `deleted+${userId}@deleted.invalid`;
}

const scimUserCreateSchema = z.object({
  schemas: z.array(z.string()).optional(),
  // userName is the canonical SCIM identifier and the value we persist
  // as `User.email`. Validate it as an email so we never write a row
  // whose email would later fail `zod.string().email()` checks elsewhere
  // in the platform (auth.service / GDPR / notification dispatch).
  userName: z.string().email().max(255),
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
    const startIndexRaw = Number.parseInt(String(req.query['startIndex'] ?? '1'), 10);
    const startIndex = Math.max(1, Number.isFinite(startIndexRaw) ? startIndexRaw : 1);
    // RFC 7644 §3.4.2.4: count=0 is a valid request meaning "return
    // zero resources but include totalResults". The earlier
    // `|| DEFAULT_PAGE_SIZE` fallback collapsed 0 to the default,
    // breaking SCIM count-only queries — use an explicit Number.isFinite
    // check so 0 stays 0 and only NaN/missing falls through to default.
    const countRaw = req.query['count'];
    const countParsed = countRaw === undefined ? DEFAULT_PAGE_SIZE : Number.parseInt(String(countRaw), 10);
    const count = Math.min(
      MAX_PAGE_SIZE,
      Math.max(0, Number.isFinite(countParsed) ? countParsed : DEFAULT_PAGE_SIZE),
    );
    const filterRaw = typeof req.query['filter'] === 'string' ? (req.query['filter'] as string) : undefined;

    let extraWhere: Record<string, unknown> = {};
    // The default list view returns active rows only. When a filter is
    // present, we still default to active rows unless the filter
    // explicitly targets `active eq false` — otherwise a `userName eq`
    // / `externalId eq` query would silently surface soft-deleted rows,
    // which is inconsistent with the no-filter behaviour and with SCIM
    // `active` semantics.
    let includeDeleted = false;
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
        includeDeleted = true; // the filter itself decides the deletedAt condition
      }
    }

    const where = {
      institutionId: inst,
      ...(includeDeleted ? {} : { deletedAt: null }),
      ...extraWhere,
    };
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

    // Refuse `active=false` on create. SCIM `active` is the User's
    // administrative status — a created-disabled user with `deletedAt`
    // would also be picked up by the retention scheduler and hard-
    // deleted after the grace window, which is not what an IdP toggling
    // active=false typically wants. Until we have a separate "disabled"
    // field, the right contract is: create active, then PUT with
    // active=false to deprovision (which runs the same scrub-and-soft-
    // delete path as DELETE).
    if (data.active === false) {
      sendScimError(res, {
        status: 400,
        detail:
          'Creating a user with active=false is not supported. Create the user, then PUT with active=false to deprovision.',
        scimType: 'invalidValue',
      });
      return;
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
      },
    });

    await audit(req, {
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
    // Scope to live (non-soft-deleted) rows only. A PUT against a
    // soft-deleted row that didn't transition active state would fall
    // into the else branch below and write `newEmail`/`newName` over
    // the scrubbed PII — silently restoring data the GDPR / DELETE path
    // had already tombstoned. Treat soft-deleted users as 404 (matches
    // GET / DELETE behaviour); reactivation isn't supported in v1.
    const existing = await prisma.user.findFirst({
      where: { id, institutionId: inst, deletedAt: null },
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

    // Determine the active-state transition. Three branches:
    //   1. active=false on a live row    → scrub-and-soft-delete (mirrors DELETE)
    //   2. active=true on a soft-deleted → reject (revive isn't supported by SCIM
    //                                       in v1; the row's PII has already been
    //                                       scrubbed, so reviving would surface a
    //                                       "[deleted user]" name to the IdP).
    //   3. anything else                  → preserve existing.deletedAt
    const transitioningToDeleted = data.active === false && existing.deletedAt === null;
    const transitioningToActive = data.active === true && existing.deletedAt !== null;

    if (transitioningToActive) {
      sendScimError(res, {
        status: 400,
        detail:
          'Reactivating a soft-deleted user via SCIM is not supported. The row\'s PII has been scrubbed; create a new user.',
        scimType: 'invalidValue',
      });
      return;
    }

    const now = new Date();
    const dataToWrite = transitioningToDeleted
      ? {
          // Same scrub the GDPR right-to-erasure path applies. Keeps
          // soft-delete semantics consistent across DELETE / PUT and
          // ensures the retention scheduler can hard-delete the row
          // after the grace window without further action. externalId
          // is cleared so a re-provision with the same externalId
          // (delete + re-add via SCIM) is not blocked by the composite
          // unique index.
          deletedAt: now,
          email: tombstoneEmail(existing.id),
          name: '[deleted user]',
          passwordHash: '',
          passwordLoginDisabled: true,
          mfaSecret: null,
          mfaEnabledAt: null,
          externalId: null,
        }
      : {
          email: newEmail,
          name: newName,
          externalId: data.externalId ?? null,
          deletedAt: existing.deletedAt,
        };

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: dataToWrite,
    });

    await audit(req, {
      action: transitioningToDeleted ? 'scim.user.deprovision' : 'scim.user.replace',
      entityType: 'User',
      entityId: updated.id,
      userId: null,
      changes: {
        institutionId: inst,
        emailChanged: !transitioningToDeleted && newEmail !== existing.email,
        externalIdChanged: (data.externalId ?? null) !== existing.externalId,
        deprovisioned: transitioningToDeleted,
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
    //
    // `externalId` is also cleared here — leaving it would block the
    // common SCIM delete-then-re-provision workflow because of the
    // composite unique index `(institutionId, externalId)`. The
    // soft-deleted row's identity is now fully tombstoned.
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
        email: tombstoneEmail(existing.id),
        name: '[deleted user]',
        passwordHash: '',
        passwordLoginDisabled: true,
        mfaSecret: null,
        mfaEnabledAt: null,
        externalId: null,
      },
    });

    await audit(req, {
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
