# Architecture Notes

## Monorepo layout

```
herm-platform/
├── client/                  # React 18 + Vite + TS (SPA served at :5173)
│   └── src/
│       ├── pages/           # Route-level components
│       ├── components/      # Shared UI (ErrorBoundary, ProtectedRoute, ...)
│       ├── contexts/        # AuthContext, SidebarContext
│       ├── hooks/           # useAuth, useApi, ...
│       ├── lib/api.ts       # Axios instance + typed API client
│       └── test/setup.ts    # Vitest client setup
├── server/                  # Express + Prisma + TS (API at :3002)
│   └── src/
│       ├── app.ts           # Express app factory (no listen — testable)
│       ├── index.ts         # Listen + graceful shutdown
│       ├── api/<feature>/   # router.ts / controller.ts / service.ts / schema.ts
│       ├── middleware/      # auth, validate, errorHandler, requestId, security
│       ├── services/        # Cross-feature services (ai-assistant, procurement-engine, stripe)
│       ├── utils/           # prisma singleton, logger, errors
│       └── test/setup.ts    # Vitest server setup
├── prisma/                  # schema.prisma, migrations, seed scripts
└── .github/workflows/ci.yml # lint + typecheck + test + build
```

## Request lifecycle

```
Client
  │ (JWT in Authorization header via axios interceptor)
  ▼
Express
  │  requestId          → sets req.id, echoes x-request-id
  │  pino-http          → req.log child logger bound to req.id
  │  helmet             → security headers (strict CSP)
  │  cors               → single allowed origin
  │  express.json       → 1 MB body cap
  │  apiRateLimiter     → 300/min global
  │  authenticateJWT    → verifies token, attaches req.user  (per-router)
  │  validateBody(zod)  → parses req.body or throws ZodError (per-route)
  │  controller         → orchestrates service call
  │  service            → Prisma + business logic
  │  errorHandler       → ZodError → 400, AppError → status+code, else → 500
  ▼
Response (with x-request-id header)
```

## Auth flow

1. `POST /api/auth/register` / `POST /api/auth/login` — return a JWT.
2. Client stores token in `localStorage` under `herm_auth_token` and sets
   the default axios Authorization header.
3. `AuthProvider` rehydrates the session on mount by calling `/api/auth/me`.
4. `ProtectedRoute` gates the authenticated app shell; unauthenticated users
   are redirected to `/login`.
5. On any 401 from the API, the axios response interceptor clears the token
   and redirects to `/login` (server-side token expiry stays authoritative).
6. Server-side: `authenticateJWT` verifies the HS256 token against
   `JWT_SECRET` and attaches `req.user: JwtPayload`. `requireRole([...])`
   enforces RBAC.

### Route auth matrix (current)

| Prefix                     | Auth                | Notes                               |
|----------------------------|---------------------|-------------------------------------|
| `/api/health`              | public              | Liveness                            |
| `/api/readiness`           | public              | DB check, returns 503 on failure    |
| `/api/auth/*`              | public + rate-limit | 20/15min                            |
| `/api/institutions/*`      | authenticated       | `requireRole` on admin subpaths     |
| `/api/admin/*`             | authenticated       | `INSTITUTION_ADMIN` / `SUPER_ADMIN` |
| `/api/systems,capabilities,scores,vendors,research,scoring,export` | public | read-only reference data |
| `/api/chat/*`              | **authenticated**   | + per-user 20/min rate limit        |
| `/api/baskets/*`           | **authenticated**   | institutional data                  |
| `/api/tco,procurement,integration,architecture,value,documents` | public | calculators; no tenant mutation |
| `/api/vendor-portal/*`     | authenticated       |                                     |
| `/api/evaluations/*`       | authenticated       |                                     |
| `/api/subscriptions/*`     | authenticated       |                                     |
| `/api/sector/analytics,notifications,keys` | authenticated | |

Anything marked "public" reads only cached reference data and has no tenant
context. When any of these gain mutation endpoints or tenant-specific reads,
flip them behind `authenticateJWT`.

## Service layering (target)

Current services are flat under `server/src/services/` and per-feature under
`server/src/api/<feature>/<feature>.service.ts`. The target separation (not
yet applied — see [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)
"deferred"):

- `services/domain/` — pure business logic, no IO beyond Prisma:
  `procurement/{scoring,tco,weighting,recommendations}.ts`, `documents/*`,
  `evaluations/*`.
- `services/integrations/` — third-party SDK wrappers with timeouts and typed
  adapters: `stripe.ts`, future `email.ts`, future `webhooks.ts`.
- `services/ai/` — LLM-bounded work: `assistant.ts` (current ai-assistant),
  `prompts.ts` (externalised system prompt + context builder), `client.ts`
  (thin Anthropic wrapper with timeout + logging), `types.ts`.

Preserve import paths via index re-exports when splitting.

## Data model overview

- **User** ↔ **Institution** (many-to-one) ↔ **Subscription** (one-to-one).
- **VendorSystem** ↔ **Score** ↔ **HermCapability** (each in a **HermFamily**).
- **CapabilityBasket** → **BasketItem** → **HermCapability**.
- **ChatMessage** keyed by `sessionId`.
- **ProcurementProject** → **ShortlistEntry** (→ **VendorSystem**) +
  **WorkflowStage** + **TcoEstimate**.

See `prisma/schema.prisma` for the full definition.

## Error model

All errors are normalised by `middleware/errorHandler.ts`:

- `ZodError` → `400 { code: VALIDATION_ERROR, details: [{field, message}] }`.
- `AppError` subclasses (`AuthError`, `ForbiddenError`, `ValidationError`,
  `NotFoundError`, `ConflictError`) → respective HTTP status + code.
- Any other `Error` → `500 { code: INTERNAL_ERROR, message }`. The message is
  hidden in production.

4xx errors log at `warn`, 5xx at `error`. Every log line carries `req.id`.

## Logging

- Root logger in `utils/logger.ts` (pino). Redaction on `authorization`,
  `cookie`, `password`, `token`, `apiKey`, `secret`.
- Per-request child logger via pino-http: `req.log.info(...)` inside handlers.
- Standard fields: `time, level, service, req.id, req.userId, req.method,
  req.url, res.statusCode, responseTime, err`.

## AI boundary

All LLM usage lives in `server/src/services/ai-assistant.ts`. Model, token
cap, timeout, and system prompt are top-level constants. See
[AI_GOVERNANCE.md](./AI_GOVERNANCE.md).
