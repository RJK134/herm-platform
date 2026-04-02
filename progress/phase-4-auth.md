# Phase 4 — Authentication, Multi-tenancy & Subscription Management
**Date**: 2026-04-02
**Status**: Complete
**Branch**: main

## What Was Done

### Part A — Prisma Schema Updates
- Added `Subscription` model with: institutionId (unique), tier (enum FREE/PROFESSIONAL/ENTERPRISE), status, stripeCustomerId, stripeSubscriptionId, currentPeriodStart, currentPeriodEnd
- Added `SubscriptionTier` enum (FREE, PROFESSIONAL, ENTERPRISE)
- Added `subscription` relation to `Institution` model (one-to-one)

### Part B — Server: Auth Middleware (server/src/middleware/auth.ts)
Replaced Phase 1 placeholder with full JWT implementation:
- `authenticateJWT` — verifies Bearer token, attaches `req.user`, returns 401 if missing/invalid
- `optionalJWT` — attaches user if token present, continues anonymously if not
- `optionalAuth` — legacy alias for optionalJWT (keeps existing route imports working)
- `requireRole([...])` — checks role after authentication, 403 if denied
- `generateToken(payload)` — signs 7-day JWT with JWT_SECRET env var
- `JwtPayload` interface: `{ userId, email, name, role, institutionId, institutionName, tier }`

### Part C — Server: Auth API Module (server/src/api/auth/)
New router at `/api/auth`:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | None | Create institution + subscription + user, return JWT |
| POST | /api/auth/login | None | Verify credentials, return JWT |
| GET | /api/auth/me | JWT | Return full user + institution + subscription info |
| PATCH | /api/auth/me | JWT | Update display name |
| POST | /api/auth/logout | None | Client-side confirmation |

**Registration flow:**
1. Check email uniqueness
2. Hash password with bcrypt (10 rounds)
3. Generate URL-safe institution slug
4. Transaction: create Institution + Subscription (FREE) + User (INSTITUTION_ADMIN)
5. Return signed JWT + user payload

### Part D — Server: Institutions API Module (server/src/api/institutions/)
New router at `/api/institutions` — all routes require `authenticateJWT`:

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | /api/institutions/me | Any | Get own institution with subscription + counts |
| PATCH | /api/institutions/me | INSTITUTION_ADMIN | Update name/logoUrl/domain |
| GET | /api/institutions/me/users | INSTITUTION_ADMIN | List all users |
| PATCH | /api/institutions/me/users/:userId/role | INSTITUTION_ADMIN | Change user role |

### Part E — Utilities
- `server/src/utils/errors.ts` — added `AuthError` (401), `ForbiddenError` (403), `ConflictError` (409)

### Part F — Prisma Seed Updates
- `prisma/seed.ts` — added bcrypt import; fixed deleteMany order (VendorProfile/VendorVersion before VendorSystem); added demo institution/subscription/user at end
- `prisma/seeds/demo-user.ts` (new) — standalone script to seed only the demo user without wiping all data

**Demo credentials:**
- Email: `demo@demo-university.ac.uk`
- Password: `demo12345`
- Role: INSTITUTION_ADMIN
- Tier: Professional

### Part G — Client: AuthContext (client/src/contexts/AuthContext.tsx)
- React Context with: `user`, `token`, `isLoading`, `isAuthenticated`, `login`, `register`, `logout`
- Stores JWT in `localStorage` key `herm_auth_token`
- On mount: reads token from localStorage, calls `/api/auth/me` to restore session
- Sets `axios.defaults.headers.common['Authorization']` for all requests
- Exports `AuthProvider` component and `useAuthContext` hook

### Part H — Client: Auth Hook (client/src/hooks/useAuth.ts)
- Re-exports `useAuthContext` as `useAuth` for clean imports

### Part I — Client: Login Page (client/src/pages/Login.tsx)
- Email + password form with show/hide password toggle
- Error display with axios error extraction
- Demo credentials box (visible on page)
- Link to `/register` for new users
- "Browse as guest" link to `/`
- Redirects to `from` location after successful login (supports ProtectedRoute redirects)

### Part J — Client: Register Page (client/src/pages/Register.tsx)
- Three-column tier comparison (Free / Professional / Enterprise)
- Registration form: name, email, institution name, country, password
- Handles API conflict errors (email already registered)
- Redirects to `/` on success

### Part K — Client: ProtectedRoute (client/src/components/auth/ProtectedRoute.tsx)
- `<ProtectedRoute requireAuth>` — redirects to `/login` if not authenticated
- `<ProtectedRoute roles={[...]}>` — shows "Access restricted" if role not in list
- Shows spinner during `isLoading` state

### Part L — Client: Sidebar Updates
- Shows institution name (from JWT) instead of "HERM Platform" when authenticated
- If authenticated: user avatar, name, email, tier badge (Free/Professional/Enterprise), sign out button
- If not authenticated: "Sign in" button navigating to `/login`
- Tier badge colours: amber (Enterprise), teal (Professional), grey (Free)
- Version bumped to v3.0.0

### Part M — Client: App.tsx Updates
- Wrapped with `<AuthProvider>` (inside BrowserRouter, outside Routes)
- `/login` and `/register` routes render full-screen (no sidebar)
- All app routes render inside `<AppShell>` with sidebar

### Part N — Client: api.ts Updates
- Added JWT interceptor: reads `herm_auth_token` from localStorage, attaches as `Authorization: Bearer` header on every request
- Added auth endpoints: `login`, `register`, `getMe`, `updateProfile`, `logout`
- Added institution endpoints: `getMyInstitution`, `updateMyInstitution`, `listInstitutionUsers`, `updateUserRole`
- Added type imports: `AuthUser`, `InstitutionDetail`, `InstitutionUser`

### Part O — Client: types/index.ts Updates
- Added `AuthUser`, `Subscription`, `InstitutionDetail`, `InstitutionUser`, `UserRole` interfaces

### Part P — Package.json
- Added `"db:seed:demo"` script to run demo-user.ts without full reseed

## Files Created/Modified
- `prisma/schema.prisma` (modified — Subscription model + enum + Institution relation)
- `prisma/seed.ts` (modified — delete ordering fix, demo user, bcrypt import)
- `prisma/seeds/demo-user.ts` (new)
- `server/src/middleware/auth.ts` (replaced placeholder with full JWT implementation)
- `server/src/utils/errors.ts` (modified — added AuthError, ForbiddenError, ConflictError)
- `server/src/api/auth/auth.schema.ts` (new)
- `server/src/api/auth/auth.service.ts` (new)
- `server/src/api/auth/auth.controller.ts` (new)
- `server/src/api/auth/auth.router.ts` (new)
- `server/src/api/institutions/institutions.service.ts` (new)
- `server/src/api/institutions/institutions.controller.ts` (new)
- `server/src/api/institutions/institutions.router.ts` (new)
- `server/src/index.ts` (modified — auth + institutions routers, port 3002)
- `client/src/contexts/AuthContext.tsx` (new)
- `client/src/hooks/useAuth.ts` (new)
- `client/src/pages/Login.tsx` (new)
- `client/src/pages/Register.tsx` (new)
- `client/src/components/auth/ProtectedRoute.tsx` (new)
- `client/src/lib/api.ts` (modified — JWT interceptor + auth/institution endpoints)
- `client/src/App.tsx` (modified — AuthProvider, login/register routes)
- `client/src/components/layout/Sidebar.tsx` (modified — user menu, logout)
- `client/src/types/index.ts` (modified — auth + institution types)
- `package.json` (modified — db:seed:demo script)
- `progress/phase-4-auth.md` (new)

## Verification
- [x] `prisma db push` — schema valid, Subscription table created
- [x] Demo user seeded — demo@demo-university.ac.uk / demo12345
- [x] `server/src/middleware/auth.ts` — full JWT implementation
- [x] `/api/auth/register` — creates Institution + Subscription + User atomically
- [x] `/api/auth/login` — returns JWT with institutionId + tier
- [x] `/api/auth/me` — returns user + institution + subscription (requires JWT)
- [x] `/api/institutions/me` — requires JWT, returns institution with subscription
- [x] Login page — demo credentials visible, redirects to dashboard
- [x] Register page — tier comparison, creates full account
- [x] Sidebar — shows user info when authenticated, sign-in button when not
- [x] Axios interceptor — attaches JWT to all API requests
- [x] AuthContext — restores session from localStorage on mount

## API Endpoints Added
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | None | Register institution + user |
| POST | /api/auth/login | None | Login, get JWT |
| GET | /api/auth/me | JWT | Get current user profile |
| PATCH | /api/auth/me | JWT | Update display name |
| POST | /api/auth/logout | None | Confirm logout |
| GET | /api/institutions/me | JWT | Get institution + subscription |
| PATCH | /api/institutions/me | JWT + Admin | Update institution |
| GET | /api/institutions/me/users | JWT + Admin | List users |
| PATCH | /api/institutions/me/users/:id/role | JWT + Admin | Update user role |

## Subscription Tiers
| Tier | Price | Key Features |
|------|-------|-------------|
| FREE | £0 | Leaderboard, heatmap, vendor profiles, 1 project, 3 baskets |
| PROFESSIONAL | £199/mo | Unlimited projects, TCO calculator, full AI, exports |
| ENTERPRISE | £499/mo | Multi-user, vendor portal, API access, dedicated support |

## Next Task
Phase 5 — Vendor Portal (vendor self-service profiles, subscription management, Stripe integration)
