# AI Governance

AI usage in Future Horizons ASPT is deliberately narrow: one feature
(`/api/chat` → AI Assistant), one provider (Anthropic), one file
(`server/src/services/ai-assistant.ts`). This document pins the policy.

## Model + version

- **Provider**: Anthropic (`@anthropic-ai/sdk`).
- **Model**: `claude-sonnet-4-20250514` (pinned as `MODEL` constant).
- **Version bumps**: open a PR that updates the constant and re-runs the
  prompt evaluation suite (see "Evaluation" below).

## Limits (hard-coded)

| Limit                 | Value        | Where                                |
|-----------------------|--------------|--------------------------------------|
| `max_tokens` output   | 1024         | `ai-assistant.ts` `MAX_TOKENS`       |
| Request timeout       | 30 s         | `ai-assistant.ts` `REQUEST_TIMEOUT_MS` (AbortController) |
| Input `message` size  | 1–2000 chars | `chat.schema.ts` `sendMessageSchema` |
| History included      | last 20 msgs | `ai-assistant.ts` `MAX_HISTORY_MESSAGES` |
| Per-user rate limit   | 20 req/min   | `chat.router.ts` `chatLimiter`        |
| Request body size     | 1 MB total   | `express.json({ limit: '1mb' })`      |

Changing any of these is an explicit governance action — not a config value,
not an env var. Edit the source and open a PR with justification.

## Prompt inventory

There is one system prompt, defined inline in `ai-assistant.ts` as
`SYSTEM_PROMPT`. It instructs the model to:

1. Act as a HERM procurement expert.
2. Cite HERM capability codes (e.g. BC011, BC086).
3. Give balanced, evidence-based vendor assessments.
4. **Never recommend a specific vendor.**
5. Keep responses concise and structured.

At call time, the prompt is augmented with a dynamic "Current platform
context" block containing the top 21 systems and their HERM coverage %.
This is deterministic (no user-controlled content) so it cannot be used as
an injection vector by other users.

When adding a second prompt, move `SYSTEM_PROMPT` into a dedicated
`services/ai/prompts.ts` and tag each prompt with a stable ID
(`assistant.system.v1`, `assistant.system.v2`).

## Auth and abuse

- `POST /api/chat` requires a valid JWT. Anonymous LLM access was removed
  during the production-readiness pass; see
  [ARCHITECTURE_NOTES.md](./ARCHITECTURE_NOTES.md) for the route auth matrix.
- Per-user rate limit of 20 requests / minute throttles both casual abuse
  and misconfigured scripts.
- All calls log the authenticated `userId` — any suspicious pattern (high
  token use, repetitive sessions) is traceable.

## PII and redaction

- User messages are persisted to `chatMessage` in the database. If the
  application becomes subject to strict PII rules, add an opt-in
  redact-on-write step before the `prisma.chatMessage.create` call.
- Logs redact `authorization`, `cookie`, `password`, `token`, `apiKey`, and
  `secret` fields via pino redact paths. The message content is **not**
  redacted in logs by default — review before logging full bodies.
- The system prompt and HERM context do not include user data from other
  tenants, so cross-tenant data leakage via context is not a risk by design.

## Cost controls

- Every successful AI call logs `{ model, inputTokens, outputTokens,
  durationMs }`. Aggregate on `userId` or `sessionId` to detect runaway
  cost.
- A per-user daily / monthly cap is **not** implemented; add one when the
  platform accepts self-service signups from untrusted users. Recommended:
  a Redis counter keyed by `{ userId, YYYY-MM-DD }`, checked in
  `chat.router.ts` before calling the service.

## Failure modes

| Condition                             | Behaviour                                                 |
|---------------------------------------|-----------------------------------------------------------|
| `ANTHROPIC_API_KEY` unset (dev)       | Service returns a static fallback string.                 |
| `ANTHROPIC_API_KEY` unset (prod)      | App **fails to start** — caught at module init.           |
| Anthropic API error                   | Logged with `err`, `durationMs`; 500 surfaces to caller.  |
| 30 s timeout exceeded                 | `AbortController` aborts; error propagates.               |
| Rate limit hit                        | 429 from `express-rate-limit` with typed body.            |

## Evaluation and audit

No automated prompt-eval suite is wired up yet. When you add one, store
cases under `server/src/services/ai-assistant.eval/` and run them in CI.
The audit trail today is the `chatMessage` table plus the structured logs.
To produce a per-user audit report, join those by `sessionId` and
correlate with the login audit log (TBD).

## What happens when the model is deprecated

Anthropic announces model retirements in advance. The process:

1. Update `MODEL` to the replacement (e.g. Claude 4.6 → Claude 4.7).
2. Run the evaluation suite; compare output quality on the canonical cases.
3. Deploy to a staging environment for at least 24 h.
4. Roll to production. Users see no change in the UI.
