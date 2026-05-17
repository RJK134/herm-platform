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

## Workflow & CI Infrastructure

These are org-wide patterns Bugbot must surface as **Medium severity** or higher whenever a PR touches `.github/workflows/` or repository scaffolding files. They reflect bugs we have hit in this org and want auto-flagged on every future PR.

### Duplicate Claude workflows on `issue_comment`

The repository contains both `.github/workflows/claude.yml` and `.github/workflows/claude-code-fix.yml` (or any two workflow files) where each subscribes to `on: issue_comment` with `types: [created]` AND has a job-level `if:` that gates on `contains(github.event.comment.body, '@claude')`. A single `@claude` mention will fire both workflows in parallel, doubling `ANTHROPIC_API_KEY` spend and producing racing PRs. Fix: keep exactly one workflow file (the pinned one, typically `claude.yml` at `anthropics/claude-code-action@<commit-sha>`); delete the older unpinned one and fold any prompt-customisation into the survivor. Severity: **Medium**.

### Missing `ANTHROPIC_API_KEY` repository secret

A PR adds or modifies `.github/workflows/claude.yml` (or any workflow that calls `anthropics/claude-code-action`) and the repository does not have an `ANTHROPIC_API_KEY` secret configured at `Settings → Secrets and variables → Actions`. The workflow's job-level `if:` will skip silently while no one `@claude`-mentions, so CI looks green at merge time and the next mention fails with an opaque `Bad credentials` error. Surface this in the PR review with a one-line nav path: `https://github.com/<owner>/<repo>/settings/secrets/actions`. Do **not** attempt to set the secret; only flag. Severity: **Medium**.

### `merge_group` trigger without job-level `if:`

A workflow declares `on: merge_group` but its jobs are gated `if: github.event_name == 'pull_request'` without `|| github.event_name == 'merge_group'`. Jobs always skip on merge-queue entries, so the merge queue passes with no real checks. Fix: every job under a workflow with `on: merge_group` must have an `if:` that includes `github.event_name == 'merge_group'` alongside `pull_request` / `push`. Severity: **Medium**.

### Cross-references

These rules were derived from:

- RJK134/Maieus2 #112 (duplicate `claude.yml` + `claude-code-fix.yml`, Bugbot finding, Medium).
- RJK134/herm-platform #151 (same pattern; rename-based fix).
- RJK134/Macbook #11 (`merge_group` without job-level `if:`).
