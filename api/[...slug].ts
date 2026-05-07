// Vercel serverless adapter — Phase 13 cutover (UAT-scope).
//
// Vercel routes every request matching `/api/*` to this catch-all and
// invokes the Express app exported below. The compiled server lives at
// `server/dist/app.js` (see vercel.json's buildCommand which runs the
// server's tsc step before Vercel bundles this file).
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
//     password login (the demo gate) is unaffected. SSO flows that
//     depend on cross-request PKCE/state will be flaky until those
//     caches migrate to Upstash Redis.
//   - Prometheus /metrics counters reset on cold start; observability
//     during the demo relies on Vercel's stdout log capture.

import type { Request, Response } from 'express';
import { createApp } from '../server/dist/app.js';
import { initSentry } from '../server/dist/lib/sentry.js';

initSentry();
const app = createApp();

export default function handler(req: Request, res: Response): void {
  app(req, res);
}
