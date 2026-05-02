/**
 * HTTP metrics middleware (Phase 12.2).
 *
 * Records per-request duration + count + in-flight gauge, with a
 * normalised `route` label that collapses dynamic IDs. Mounted before
 * the rest of the routing stack so it sees every request, including
 * ones that 404 or 500 inside other middleware.
 *
 * Route normalisation: Express populates `req.route` only AFTER a route
 * matches, so we capture the route in `res.on('finish', ...)`. For
 * unmatched paths, fall back to a literal `__not_found` label rather
 * than the raw URL — a metrics scrape must not accumulate per-URL
 * cardinality from probe traffic.
 */
import type { NextFunction, Request, Response } from 'express';
import {
  httpRequestsInFlight,
  observeHttpRequest,
} from '../lib/metrics';

/**
 * Best-effort route name for a finished response. Express stores the
 * mount point in `req.baseUrl` and the matched route pattern in
 * `req.route?.path`. Joining them gives a stable label like
 * `/api/users/:id` regardless of how the route is nested.
 *
 * Returns `__not_found` when no route matched (404) — a deliberate
 * sentinel so a probe storm of distinct URLs doesn't blow up the
 * metric cardinality.
 */
function resolveRouteLabel(req: Request): string {
  const routePath = req.route?.path;
  if (typeof routePath !== 'string' || routePath.length === 0) {
    return '__not_found';
  }
  // `req.baseUrl` is the mount-point prefix (e.g. `/api/v1/users`).
  // `routePath` is the final segment pattern (`/:id`). Concatenate so
  // the label survives every level of router nesting.
  const baseUrl = req.baseUrl ?? '';
  // Routes mounted at `/` produce `routePath === '/'`, which would
  // double-slash if the base is also non-empty. Trim cleanly.
  if (routePath === '/' && baseUrl.length > 0) return baseUrl;
  return `${baseUrl}${routePath}`;
}

/**
 * Express middleware that records the standard HTTP metrics
 * (`herm_http_request_duration_seconds`, `herm_http_requests_total`,
 * `herm_http_requests_in_flight`).
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = req.method;
  const startNs = process.hrtime.bigint();
  httpRequestsInFlight.inc({ method });

  let recorded = false;
  const finalize = (): void => {
    if (recorded) return;
    recorded = true;
    httpRequestsInFlight.dec({ method });
    const durationSeconds = Number(process.hrtime.bigint() - startNs) / 1e9;
    const route = resolveRouteLabel(req);
    observeHttpRequest(method, route, res.statusCode, durationSeconds);
  };

  // `finish` fires after the response is fully flushed to the socket;
  // `close` fires when the client disconnects mid-response. Either
  // way we want exactly one observation, so guard with `recorded`.
  res.on('finish', finalize);
  res.on('close', finalize);

  next();
}
