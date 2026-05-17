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

### Workflow & CI Infrastructure

Flag these as **Medium severity** when a PR touches `.github/workflows/` or repository scaffolding files:

- Two or more workflow files (e.g. `claude.yml` and `claude-code-fix.yml`) both subscribing to `on: issue_comment` with a job-level `if:` that contains `'@claude'` — a single mention fires both, doubling `ANTHROPIC_API_KEY` spend and producing racing PRs. Fix: keep exactly one pinned workflow (`anthropics/claude-code-action@<commit-sha>`) and delete the older unpinned file, folding any prompt-customisation into the survivor.
- Any workflow that calls `anthropics/claude-code-action` added or modified without an `ANTHROPIC_API_KEY` secret configured at `Settings → Secrets and variables → Actions` — the job-level `if:` skips silently until someone `@claude`-mentions, at which point the action fails with `Bad credentials`. Surface the nav path `https://github.com/<owner>/<repo>/settings/secrets/actions` in the review; do **not** attempt to set the secret.
- A workflow declaring `on: merge_group` whose jobs are gated `if: github.event_name == 'pull_request'` without `|| github.event_name == 'merge_group'` — jobs always skip on merge-queue entries, so the merge queue passes with no real checks. Fix: every job under such a workflow must include `github.event_name == 'merge_group'` in its `if:` alongside `pull_request` / `push`.

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

## Cross-references

The Workflow & CI Infrastructure rules were derived from:

- RJK134/Maieus2 #112 (duplicate `claude.yml` + `claude-code-fix.yml`, Bugbot finding, Medium).
- RJK134/herm-platform #151 (same pattern; rename-based fix).
- RJK134/Macbook #11 (`merge_group` without job-level `if:`).
