# Architecture notes

## High-level layout

```
┌──────────────────────┐    HTTPS / JSON      ┌─────────────────────────────┐
│  React + Vite (SPA)  │ ─────────────────▶   │    Express API              │
│  client/             │   JWT (Bearer)       │    server/                  │
│  - routes            │                      │    - /api/* routers         │
│  - TanStack Query    │                      │    - middleware stack       │
│  - Tailwind          │                      │    - services/ (3-way)      │
│  - AuthContext       │                      │    - lib/ (logger, respond) │
└──────────────────────┘                      │    - utils/ (errors, pg)    │
                                              └──────────────┬──────────────┘
                                                             │ Prisma
                                                             ▼
                                                    ┌──────────────────┐
                                                    │  PostgreSQL      │
                                                    └──────────────────┘
```

## Module boundaries (backend)

| Layer             | Directory                                | Responsibility                                                          |
|-------------------|------------------------------------------|-------------------------------------------------------------------------|
| Routing           | `server/src/api/<domain>/`               | Express routers, request/response shape, wiring middleware              |
| Validation        | `server/src/middleware/validate.ts`      | `validate({body,query,params})` helpers over Zod                        |
| Auth / AuthZ      | `server/src/middleware/auth.ts`          | `authenticateJWT`, `optionalJWT`, `requireRole`                         |
| Framework context | `server/src/middleware/framework-context.ts` + `tier-gate.ts` | Resolves `req.framework` from `?frameworkId=…`, enforces free-tier can only read public frameworks |
| Commercial gates  | `server/src/middleware/require-paid-tier.ts` | Gates proprietary *features* (not frameworks) by subscription tier. Returns `403 SUBSCRIPTION_REQUIRED` |
| Errors            | `server/src/middleware/errorHandler.ts`  | Maps Zod / AppError / Prisma errors to the `{success,error}` envelope   |
| Observability     | `server/src/middleware/requestId.ts`, `httpLogger.ts` + `lib/logger.ts` | pino + pino-http + nanoid correlation                 |
| Provenance        | `server/src/lib/provenance.ts` + `lib/branding.ts` | HERM attribution block attached to every framework-scoped response. See [HERM_COMPLIANCE](../HERM_COMPLIANCE.md) |
| Domain services   | `server/src/services/domain/`            | Procurement engine, workflow rules                                      |
| Integration       | `server/src/services/integration/`       | Stripe (external integrations live here)                                |
| AI (governed)     | `server/src/services/ai/`                | **Only** place allowed to import `@anthropic-ai/sdk`. See AI_GOVERNANCE.|
| Data              | `server/src/utils/prisma.ts`             | Single Prisma client instance                                           |

ESLint enforces the AI boundary via `no-restricted-imports` scoped to everything outside `services/ai/`.

## Request lifecycle

```
 request
   │
   ▼
 requestId       ──▶  attaches req.id + x-request-id header
   │
 httpLogger      ──▶  pino-http line { reqId, method, url, status, latency }
   │
 helmet / CORS   ──▶  security headers + origin check
   │
 rate limiter    ──▶  per-IP throttle (global + stricter on /api/auth)
   │
 route handler   ──▶  authenticateJWT? validate()? business logic
   │                  returns via ok() / created() helpers from lib/respond
   ▼
 errorHandler    ◀──  anything thrown: Zod/AppError/Prisma → envelope
```

## Auth model

- Tokens are JWTs (HS256, 7-day expiry) issued by `/api/auth/login`.
- The JWT payload includes `{ userId, email, name, role, institutionId, institutionName, tier }`. All claims are trust-bounded: no DB lookup per request.
- Roles (lightweight RBAC): `SUPER_ADMIN`, `INSTITUTION_ADMIN`, `PROCUREMENT_LEAD`, `EVALUATOR`, `VENDOR_ADMIN`, `VENDOR_CONTRIBUTOR`, `VIEWER`.
- `requireRole(['...'])` gates mutating routes.
- Vendor portal (`/api/vendor-portal/*`) has its own token type with a separate middleware so vendor tokens can't cross-authenticate into institution endpoints.
- Failed auth returns `401 AUTHENTICATION_ERROR`; insufficient role returns `403 AUTHORIZATION_ERROR`. Both carry `requestId`.

## AI boundary

All AI access flows through `server/src/services/ai/ai-client.ts`:

```
  Callers (chat.controller, future AI features)
        │
        ▼
 services/ai/ai-assistant.ts         ← domain-specific prompts, context building
        │
        ▼
 services/ai/ai-client.ts            ← model allowlist, size caps, sanitiser, pino log
        │
        ▼
 @anthropic-ai/sdk                   ← only imported here; ESLint blocks elsewhere
```

Caps:
- `maxInputChars = 2000`
- `maxHistoryMessages = 20`
- `maxSystemPromptChars = 8000`
- `maxOutputTokens = 1024`

Every call emits a `{ requestId, userId, sessionId, model, tokensIn, tokensOut, latencyMs, outcome }` log line.

## Data model hotspots

- `HermFamily` + `HermCapability` — the 11-family, 165-capability UCISA HERM framework.
- `VendorSystem` + `VendorProfile` — the 21 benchmarked systems with vendor metadata.
- `Score` — `(systemId, capabilityId, version)` unique; allows historical versioning of scores.
- `ChatMessage.userId` (nullable, additive migration) — owned-session model for authenticated chat.
- `Subscription` — one-per-institution, tier-enum (`FREE | PROFESSIONAL | ENTERPRISE`), tracked via Stripe metadata.

## Client data flow

```
 AuthContext (login / register / logout / me-restore)
      │
      │ JWT stored at localStorage['herm_auth_token']
      ▼
 lib/api.ts  (axios client with two interceptors)
      │       request: attaches Authorization: Bearer <token>
      │       response: on 401 clear token + redirect /login?returnTo=<here>
      ▼
 React Query hooks (staleTime 5min, 1 retry)
      ▼
 Page components (wrapped in <AsyncBoundary> or existing patterns)
```

Protected routes are declared in `client/src/App.tsx` via `<ProtectedRoute>` (or `<ProtectedRoute roles={...}>` for admin pages). The guard reads `useAuth()` and redirects to `/login` while preserving `returnTo`.

## Configuration

All config is environment-driven (`.env.example` lists every variable). Production fails fast on missing `JWT_SECRET`; other keys (Stripe, Anthropic) degrade gracefully when absent.

## Compliance boundaries

HERM content (CC-BY-NC-SA-4.0) and the proprietary FHE Capability Framework coexist in the same schema but must never be blurred for commercial or legal purposes. The authoritative mapping between route, auth, tier, and provenance requirements lives in [HERM_COMPLIANCE.md](../HERM_COMPLIANCE.md). The two bright-line rules:

1. **HERM capability access is free.** Every route scoped to the HERM framework must be reachable by anonymous / free-tier callers.
2. **HERM attribution travels with the data.** `lib/provenance.ts::okWithProvenance` attaches a `meta.provenance.framework{…}` block to every framework-scoped response; `/api/export/*` additionally sets `x-framework-*` response headers; the UI renders `<LicenceAttribution />` on the main HERM pages and `<LicenceFooter />` globally.

The `tierGate` middleware gates framework **data** (HERM vs FHE); the separate `requirePaidTier` middleware gates proprietary **features** (framework-mappings API, API keys). They are independent — a free-tier caller can still reach HERM data via `tierGate`, and a paid-tier caller can still be refused by `requirePaidTier` if the feature is enterprise-only.

## Future-facing notes

- The AI allowlist is a single source of truth (`AI_LIMITS` + `ALLOWED_MODELS` in `ai-client.ts`). New models go through a PR that edits that constant.
- `procurement-engine.ts` is a candidate for further splitting (stages / compliance / timeline) when next changed.
- Metrics are currently emitted as structured log lines; a follow-up can wire the same port to Prometheus without touching callers.
