// Vercel serverless adapter — Phase 13 cutover (UAT-scope).
//
// Vercel routes every request matching `/api/*` to this catch-all and
// invokes the Express app exported below. The compiled server lives at
// `server/dist/app.js` (see vercel.json's buildCommand which runs the
// server's tsc step before Vercel bundles this file).
//
// Sentry-init ordering:
//   ESM hoists static imports — a static `import { createApp } from
//   '../server/dist/app.js'` would evaluate the Express app's entire
//   module graph (Prisma, middleware, routers) BEFORE any code in this
//   file's body runs. server/src/index.ts deliberately calls initSentry()
//   first so the SDK's auto-instrumentation hooks land on Express +
//   Prisma at module-evaluation time. To preserve that ordering here we
//   statically import only initSentry, call it, then dynamically import
//   createApp. The default export waits on the dynamic import (top-level
//   await is supported on Vercel's Node 20 ESM runtime).
//
// What's intentionally NOT done compared to server/src/index.ts:
//   - No app.listen() — Vercel's runtime drives HTTP.
//   - No prisma.$connect() startup ping — Prisma lazy-connects on first
//     query; failures surface as 503 DATABASE_UNAVAILABLE via
//     server/src/middleware/errorHandler.ts.
//   - No retention or UKAMF schedulers — long-running jobs don't fit a
//     per-request invocation. They become Vercel Cron candidates in a
//     follow-up; out of scope for the UAT demo.
//   - No SIGTERM/SIGINT shutdown hooks — Vercel manages function lifecycle.
//
// Caveats for the UAT demo (acceptable scope, documented in
// progress/phase-13-vercel-serverless-evaluation.md):
//   - In-memory caches (lockout counters, OIDC PKCE flow, SAML SLO
//     replay-cache, JWT JTI store) survive within one warm Lambda but
//     reset on cold start and don't share across instances. Email/
//     password login (the demo gate) is unaffected.
//   - /metrics and /scim/v2/* are mounted at non-/api paths in
//     server/src/app.ts and are therefore unreachable through this
//     /api/-only catch-all. Both are explicitly out of UAT scope:
//     metrics counters reset on cold start regardless (eval doc lines
//     117-122); SCIM provisioning isn't part of the demo. Restore
//     either by (a) adding explicit Vercel rewrites + an Express mount
//     under /api, or (b) keeping a long-lived deployment for those
//     surfaces. Tracked under the Phase 13 audit deferred items.

import { initSentry } from '../server/dist/lib/sentry.js';
initSentry();

const { createApp } = await import('../server/dist/app.js');
export default createApp();
