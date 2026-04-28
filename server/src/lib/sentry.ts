/**
 * Sentry integration — minimal, opt-in, vendor-replaceable.
 *
 * Design choices:
 * 1. Hard dependency on `@sentry/node` (v8) — keeps the call sites small and
 *    matches how `stripe` is integrated. The Sentry SDK is itself a no-op
 *    when `init()` is not called.
 * 2. Side-effect-free at module load. The entry point (`index.ts`) calls
 *    `initSentry()` once at boot. Tests that import `app.ts` / `errorHandler`
 *    therefore never initialise Sentry, so `captureServerError` becomes a
 *    cheap no-op without needing module mocks.
 * 3. Capture is wrapped behind `captureServerError` so the rest of the code
 *    only knows about one tiny abstraction. Swapping Sentry for Datadog or
 *    OpenTelemetry later is a one-file change.
 * 4. Only HTTP 5xx and the 503 `PrismaClientInitializationError` route are
 *    captured. 4xx errors are user mistakes, not bugs.
 */
import * as Sentry from '@sentry/node';

let active = false;

function parseSampleRate(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return 0;
  return n;
}

export function initSentry(): void {
  // Idempotent — re-running init is a no-op so tests that exercise this
  // path more than once don't double-register transports.
  if (active) return;
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'unknown',
    tracesSampleRate: parseSampleRate(process.env['SENTRY_TRACES_SAMPLE_RATE']),
    // Don't auto-capture breadcrumbs from console.* — pino is the canonical
    // log surface and the explicit `captureServerError` call from the error
    // handler is the canonical capture point.
    integrations: (defaults) => defaults.filter((i) => i.name !== 'Console'),
  });
  active = true;
}

export interface CaptureContext {
  requestId?: string;
  userId?: string;
  path?: string;
  method?: string;
}

/**
 * Send an error to Sentry with HTTP request context. No-op when Sentry has
 * not been initialised (no DSN configured, or running under tests).
 */
export function captureServerError(err: unknown, ctx: CaptureContext = {}): void {
  if (!active) return;
  const tags: Record<string, string> = {};
  if (ctx.requestId) tags['requestId'] = ctx.requestId;
  if (ctx.path) tags['http.path'] = ctx.path;
  if (ctx.method) tags['http.method'] = ctx.method;

  Sentry.captureException(err, {
    tags,
    user: ctx.userId ? { id: ctx.userId } : undefined,
  });
}

/**
 * Drain pending events before process exit. No-op when not initialised.
 * Resolves after at most `timeoutMs` even if the network is slow.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!active) return;
  await Sentry.flush(timeoutMs);
}

/**
 * Test-only: reset the module-level `active` flag so unit tests can drive
 * `initSentry` and `captureServerError` deterministically across cases.
 */
export function __resetSentryForTests(): void {
  active = false;
}
