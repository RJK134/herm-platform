/**
 * SCIM 2.0 ↔ HERM `User` row mapping.
 *
 * SCIM attributes we actually round-trip (RFC 7643 §4.1):
 *   id, externalId, userName, name (givenName/familyName),
 *   emails[].{value, primary, type}, active, meta.*
 *
 * Attributes we deliberately don't model in v1:
 *   - phoneNumbers / addresses / photos      no underlying field on User
 *   - roles / entitlements / groups          v2; needs Group resource first
 *   - x509Certificates                       not relevant to HERM
 *   - "ims" (instant-messaging handles)      legacy; clients rarely send
 */
import type { User } from '@prisma/client';

export const USER_RESOURCE_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';

/** Shape returned in API responses for a SCIM User resource. */
export interface ScimUser {
  schemas: [typeof USER_RESOURCE_SCHEMA];
  id: string;
  externalId?: string;
  userName: string;
  name: {
    givenName?: string;
    familyName?: string;
    formatted?: string;
  };
  emails: Array<{ value: string; primary: boolean; type?: string }>;
  active: boolean;
  meta: {
    resourceType: 'User';
    created: string;
    lastModified: string;
    location: string;
  };
}

/**
 * Best-effort split of `User.name` (a single string in HERM) into
 * `givenName` + `familyName` for SCIM. Most SCIM clients will set both
 * sides explicitly via PUT/PATCH; we only round-trip what's stored.
 */
function splitName(full: string): { givenName?: string; familyName?: string } {
  const trimmed = full.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { givenName: parts[0]! };
  return {
    givenName: parts[0]!,
    familyName: parts.slice(1).join(' '),
  };
}

export function userToScim(user: User, baseUrl: string): ScimUser {
  const { givenName, familyName } = splitName(user.name);
  return {
    schemas: [USER_RESOURCE_SCHEMA],
    id: user.id,
    ...(user.externalId ? { externalId: user.externalId } : {}),
    userName: user.email,
    name: {
      ...(givenName ? { givenName } : {}),
      ...(familyName ? { familyName } : {}),
      formatted: user.name,
    },
    emails: [{ value: user.email, primary: true, type: 'work' }],
    active: user.deletedAt === null,
    meta: {
      resourceType: 'User',
      created: user.createdAt.toISOString(),
      lastModified: user.updatedAt.toISOString(),
      location: `${baseUrl}/scim/v2/Users/${user.id}`,
    },
  };
}

/**
 * Build a `name` string from a SCIM `name` object. SCIM clients may
 * send `formatted`, just `givenName + familyName`, or both. Prefer the
 * formatted one when present so the UI shows what the IdP intended.
 */
export function joinScimName(scim: { givenName?: string; familyName?: string; formatted?: string } | undefined): string {
  if (!scim) return '';
  if (scim.formatted) return scim.formatted.trim();
  const g = scim.givenName?.trim() ?? '';
  const f = scim.familyName?.trim() ?? '';
  return [g, f].filter(Boolean).join(' ');
}

/**
 * Pick the primary email from a SCIM emails[] array. RFC 7643 §4.1.2:
 * exactly one entry SHOULD be marked primary. If none is, fall back to
 * the first entry; if the array is empty, return null.
 */
export function pickPrimaryEmail(
  emails: Array<{ value?: string; primary?: boolean }> | undefined,
): string | null {
  if (!emails || emails.length === 0) return null;
  const primary = emails.find((e) => e.primary && e.value);
  if (primary?.value) return primary.value.toLowerCase();
  const first = emails.find((e) => e.value);
  return first?.value?.toLowerCase() ?? null;
}
