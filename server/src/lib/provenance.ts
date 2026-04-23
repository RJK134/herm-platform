import type { Request, Response } from 'express';
import type { ApiMeta } from './respond';
import { isCcLicence } from './branding';

/**
 * Standard provenance block attached to framework-scoped API responses.
 *
 * The goals:
 *   - Downstream UIs (the HERM attribution banner, exported PDFs,
 *     third-party API consumers) should never have to re-derive where a
 *     dataset came from. They read `meta.provenance.framework.publisher`
 *     and `…licence.notice` verbatim.
 *   - Compliance audits can diff the production HERM licence text
 *     against the value fixed in `lib/branding.ts` + the seed.
 *   - If a request leaks proprietary data where public was expected, the
 *     provenance block on the response makes the bug obvious.
 */
export interface FrameworkProvenance {
  framework: {
    id: string;
    slug: string;
    name: string;
    publisher: string;
    licence: {
      type: string;
      url: string | null;
      notice: string | null;
      requiresAttribution: boolean;
    };
  };
}

/**
 * Build a provenance block from the framework attached by
 * `frameworkContext` middleware. Callers should have `optionalJWT`,
 * `frameworkContext`, and typically `tierGate` upstream in the pipeline.
 *
 * Returns `null` only when the middleware chain was bypassed — in
 * practice every framework-scoped route populates `req.framework`.
 */
export function buildProvenance(req: Request): FrameworkProvenance | null {
  const fw = req.framework;
  if (!fw) return null;

  const licenceType = fw.licenceType ?? 'UNKNOWN';

  return {
    framework: {
      id: fw.id,
      slug: fw.slug,
      name: fw.name,
      publisher: fw.publisher,
      licence: {
        type: licenceType,
        url: fw.licenceUrl ?? null,
        notice: fw.licenceNotice ?? null,
        requiresAttribution: isCcLicence(licenceType),
      },
    },
  };
}

/**
 * Convenience wrapper that sends a `{ success, data, meta }` response with
 * the framework provenance block pre-populated from `req.framework`. Use
 * this in controllers that already run through `frameworkContext`.
 *
 * Extra `meta` fields (e.g. pagination) can be merged in via the fourth
 * argument; provenance wins on `provenance` key collisions.
 */
export function okWithProvenance<T>(
  res: Response,
  req: Request,
  data: T,
  extraMeta?: ApiMeta,
): Response {
  const provenance = buildProvenance(req);
  const meta = { ...(extraMeta ?? {}), ...(provenance ? { provenance } : {}) };
  const hasMeta = Object.keys(meta).length > 0;
  return res.json(hasMeta ? { success: true, data, meta } : { success: true, data });
}

/**
 * Framework metadata shape used by `frameworkPairProvenance`. Any
 * `framework.findUnique`/`findMany` projection that selects these fields
 * satisfies it.
 */
export interface FrameworkLike {
  id: string;
  slug: string;
  name: string;
  publisher: string;
  licenceType: string | null;
  licenceUrl: string | null;
  licenceNotice: string | null;
}

/**
 * Cross-framework provenance for endpoints that return both sides of a
 * mapping (e.g. `/api/framework-mappings`). Emits both source and target
 * as first-class siblings so attribution for HERM (source) is visible
 * even when the caller is inspecting proprietary target data.
 */
export function frameworkPairProvenance(
  source: FrameworkLike,
  target: FrameworkLike,
): {
  source: FrameworkProvenance['framework'];
  target: FrameworkProvenance['framework'];
} {
  return {
    source: toFrameworkBlock(source),
    target: toFrameworkBlock(target),
  };
}

function toFrameworkBlock(fw: FrameworkLike): FrameworkProvenance['framework'] {
  const licenceType = fw.licenceType ?? 'UNKNOWN';
  return {
    id: fw.id,
    slug: fw.slug,
    name: fw.name,
    publisher: fw.publisher,
    licence: {
      type: licenceType,
      url: fw.licenceUrl ?? null,
      notice: fw.licenceNotice ?? null,
      requiresAttribution: isCcLicence(licenceType),
    },
  };
}
