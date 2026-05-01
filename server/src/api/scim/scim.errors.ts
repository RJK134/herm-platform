/**
 * SCIM 2.0 error envelope (RFC 7644 §3.12).
 *
 * Every non-2xx response from the SCIM surface MUST use this shape
 * instead of the HERM `{ success, error }` envelope so SCIM clients
 * (Okta, Entra ID, etc.) can parse it without special-case code.
 */
import type { Response } from 'express';

export const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

/**
 * `scimType` keywords from RFC 7644 §3.12. Subset we actually emit:
 *   - `invalidFilter`     malformed filter expression on a query
 *   - `invalidPath`       PATCH path that we don't support
 *   - `invalidSyntax`     body that doesn't parse as expected
 *   - `invalidValue`      value of a known attribute is malformed
 *   - `mutability`        attempt to modify a read-only attribute
 *   - `noTarget`          PATCH targeted a path that doesn't exist
 *   - `tooMany`           query result exceeds server cap
 *   - `uniqueness`        creating a resource that violates uniqueness
 */
export type ScimType =
  | 'invalidFilter'
  | 'invalidPath'
  | 'invalidSyntax'
  | 'invalidValue'
  | 'mutability'
  | 'noTarget'
  | 'tooMany'
  | 'uniqueness';

interface ScimErrorOptions {
  status: number;
  detail: string;
  scimType?: ScimType;
}

export function sendScimError(res: Response, opts: ScimErrorOptions): void {
  const body: Record<string, unknown> = {
    schemas: [SCIM_ERROR_SCHEMA],
    status: String(opts.status),
    detail: opts.detail,
  };
  if (opts.scimType) body['scimType'] = opts.scimType;
  res.status(opts.status).type('application/scim+json').json(body);
}

/**
 * Convert a Zod parse error into a SCIM 400 with `invalidSyntax`. Keeps
 * the per-issue path/message in `detail` so SCIM clients see something
 * actionable.
 */
export function sendScimZodError(res: Response, err: { issues: { path: (string | number)[]; message: string }[] }): void {
  const detail = err.issues
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ');
  sendScimError(res, { status: 400, detail, scimType: 'invalidSyntax' });
}
