/**
 * Minimal SCIM filter parser (RFC 7644 §3.4.2.2).
 *
 * Full SCIM filter syntax is a small expression language with `and`,
 * `or`, `not`, parentheses, comparison operators (`eq`, `ne`, `co`,
 * `sw`, `ew`, `gt`, `lt`, etc.) and complex value paths. v1 here only
 * supports the cases real-world IdPs (Entra, Okta) actually emit on
 * the User resource:
 *
 *   userName eq "alice@uni.test"
 *   externalId eq "abc-123"
 *   active eq true   /   active eq false
 *
 * Anything else returns `null` and the controller responds 400 with
 * `scimType: invalidFilter`. When the SPEC support gap bites a real
 * customer we extend the parser; until then, refusing unknown filters
 * is safer than silently mis-applying them.
 */

export type ScimEqFilter =
  | { attribute: 'userName'; value: string }
  | { attribute: 'externalId'; value: string }
  | { attribute: 'active'; value: boolean };

const RX = /^\s*(userName|externalId|active)\s+eq\s+(.+?)\s*$/i;

function parseScalar(raw: string): string | boolean | null {
  const trimmed = raw.trim();
  // Bare booleans (active eq true / false)
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  // Quoted strings, supporting both " and \"
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return null;
}

export function parseFilter(input: string | undefined): ScimEqFilter | null {
  if (!input) return null;
  const m = RX.exec(input);
  if (!m) return null;
  const attribute = m[1]!.toLowerCase() as 'username' | 'externalid' | 'active';
  const scalar = parseScalar(m[2]!);
  if (scalar === null) return null;
  if (attribute === 'username' && typeof scalar === 'string') {
    return { attribute: 'userName', value: scalar };
  }
  if (attribute === 'externalid' && typeof scalar === 'string') {
    return { attribute: 'externalId', value: scalar };
  }
  if (attribute === 'active' && typeof scalar === 'boolean') {
    return { attribute: 'active', value: scalar };
  }
  return null;
}
