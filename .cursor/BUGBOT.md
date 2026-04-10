# BugBot Review Rules for herm-platform

## Project Overview

herm-platform is a full-stack TypeScript monorepo (npm workspaces) with:
- **Client**: React 18 + Vite + TailwindCSS + React Router + TanStack Query
- **Server**: Express + TypeScript + Prisma ORM (PostgreSQL)
- **Auth**: JWT-based authentication with bcryptjs password hashing
- **Payments**: Stripe integration for subscriptions
- **AI**: Anthropic SDK integration
- **i18n**: i18next for internationalization

## Flag These Issues

### Security
- Any Express route or middleware missing authentication/authorization checks
- SQL injection or Prisma query injection vulnerabilities
- Missing input validation (all user input should be validated with Zod)
- Secrets, API keys, or credentials hardcoded in source code
- Missing or misconfigured CORS, Helmet, or rate-limiting middleware
- JWT tokens stored insecurely or missing expiration
- Sensitive data (passwords, tokens, Stripe keys) leaked in API responses or logs
- Cross-site scripting (XSS) vulnerabilities in React components (e.g., dangerouslySetInnerHTML)

### Data Integrity
- Prisma queries missing error handling or transaction boundaries where needed
- Missing cascade behavior on relational deletes
- Race conditions in concurrent database operations
- Stripe webhook handlers missing idempotency or signature verification

### Code Quality
- TypeScript `any` types that should be properly typed
- Missing null/undefined checks that could cause runtime errors
- Unhandled promise rejections in async Express handlers
- React components with missing dependency arrays in useEffect/useMemo/useCallback
- Memory leaks from uncleared intervals, event listeners, or subscriptions

### API Design
- REST endpoints returning inconsistent response shapes
- Missing HTTP status codes or incorrect status code usage
- Endpoints missing rate limiting where appropriate

## Ignore These

- Styling or CSS/Tailwind class ordering preferences
- Test fixture files and seed data (`prisma/seed.ts`, `prisma/seeds/`)
- Auto-generated files (`prisma/generated/`, `dist/`, `node_modules/`)
- The `package-lock.json` file
- Minor formatting issues (whitespace, trailing commas, semicolons)
- Import ordering preferences
- Comments about obvious code

## Tone

Be direct and concise. Focus on bugs, security vulnerabilities, and correctness issues. Suggest specific fixes with code when possible. Do not comment if there is nothing actionable to fix.
