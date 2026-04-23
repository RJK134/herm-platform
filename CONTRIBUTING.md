# Contributing

## Branching

- `main` is the integration branch. All changes land via pull request.
- Feature branches: `feat/<short-desc>`, `fix/<short-desc>`, `chore/<short-desc>`.
- Long-lived claude-assisted branches follow `claude/<task>` (e.g.
  `claude/production-readiness-XXXXX`).

## Commit style

- Imperative mood, sentence case: `Add readiness endpoint`, not `Added` or
  `adds`. Keep the subject ≤ 72 chars.
- Body (optional) explains the **why**, not the **what**.
- One logical change per commit; separate refactors from behaviour changes.

## Pull requests

Checklist before requesting review:

- [ ] `npm run lint` clean (0 errors; warnings allowed but noted).
- [ ] `npm run typecheck` clean.
- [ ] `npm test` clean.
- [ ] `npm run build` clean.
- [ ] If you added a route, it has auth middleware (or an explicit note in
      the PR description explaining why it's public).
- [ ] If you added LLM usage, it's in `services/ai-assistant.ts` (or a
      sibling under `services/ai/`) and updates
      [AI_GOVERNANCE.md](./AI_GOVERNANCE.md).
- [ ] If you added a secret, it's in `.env.example` with a comment.
- [ ] If you changed schema, you ran `npm run db:generate`.

## Coding style

- TypeScript strict mode; avoid `any` — ESLint enforces this as an error.
- Prefer the Prisma singleton from `server/src/utils/prisma.ts`; do not
  `new PrismaClient()` ad-hoc.
- Use the shared `AppError` family from `server/src/utils/errors.ts` for
  thrown errors; the central error handler formats them consistently.
- Use `validateBody(zodSchema)` middleware rather than in-handler parsing.
- Server logs: use `logger` from `utils/logger.ts` or `req.log` from
  pino-http. No `console.log` in request-path code.

## Running tests

```bash
npm test                 # all
npm run test:server      # server only
npm run test:client      # client only
npm run test:watch -w server   # watch mode
```

Server tests mock Prisma by default. See
`server/src/api/health/__tests__/readiness.test.ts` for the mocking
pattern.

## Filing an issue

Include:

- What you expected to happen.
- What actually happened.
- Steps to reproduce.
- A correlating `x-request-id` if the bug is server-side.
