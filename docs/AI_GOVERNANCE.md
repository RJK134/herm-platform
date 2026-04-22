# AI governance

Every AI call in this repository flows through a single governed entry point: `server/src/services/ai/ai-client.ts`. This document describes the invariants that module maintains, and what must be preserved when adding a new AI surface.

## Invariants

### 1. Single point of entry
`ai-client.ts` is the **only** module allowed to import `@anthropic-ai/sdk`. ESLint's `no-restricted-imports` rule enforces this for every file outside `server/src/services/ai/`. If you need to reach the AI, you go through `createCompletion(...)`.

### 2. Model allowlist
Models are whitelisted via `ALLOWED_MODELS`. Any attempt to use a non-allowlisted model throws `AiLimitExceededError`. To add a model, edit the constant and open a PR — this creates a reviewable history of which models this product has sanctioned.

Currently allowed:
- `claude-sonnet-4-20250514`

### 3. Bounded inputs and outputs
Caps are declared in `AI_LIMITS`:

| Limit                    | Value | Purpose                                                         |
|--------------------------|-------|-----------------------------------------------------------------|
| `maxInputChars`          | 2000  | Limits per-turn user input; enforced in `sanitiseUserInput`.    |
| `maxHistoryMessages`     | 20    | Bounds context window + cost per call.                          |
| `maxSystemPromptChars`   | 8000  | Prevents context stuffing in system prompts.                    |
| `maxOutputTokens`        | 1024  | Caps response size and spend per call.                          |

### 4. Prompt-injection mitigations
`sanitiseUserInput`:
- strips ASCII control characters and DEL (U+0000–U+001F, U+007F).
- replaces common prompt-injection markers (`<|im_start|>`, `<|im_end|>`, trailing `system:` / `assistant:` / `user:` role headers) with `[filtered]`.
- throws `AiLimitExceededError` if the sanitised result exceeds `maxInputChars`.

These are not perfect — they're defence in depth on top of using a role-based message API that already separates `system` / `user` / `assistant` content.

### 5. Observable every call
Every successful `createCompletion` emits one `info` log line:

```
{
  component: 'ai-client',
  requestId, userId, sessionId,
  model, tokensIn, tokensOut, latencyMs,
  outcome: 'ok'
}
```

Failures surface through the standard error handler and carry the same `requestId` on the client-facing response. Token counts are an auditable cost signal; correlating them to `userId` enables per-user quotas and abuse detection when you need them.

### 6. Authenticated-only surfaces
Chat (`/api/chat`) is authenticated. There is no anonymous chat in this build. Session ownership is enforced in `ai-assistant.ts::assertSessionOwnership`: reading, writing, or clearing a session owned by another user returns 403.

Historical `ChatMessage` rows with `userId = null` (from the anonymous-chat era) are unreachable by authenticated users and can be deleted by a future migration.

### 7. Graceful degradation when unconfigured
If `ANTHROPIC_API_KEY` is not set, `isAiConfigured()` returns `false` and chat returns a static help message directing the user to non-AI features. The service never 500s due to missing AI configuration.

## Adding a new AI surface

1. Design the caller as a thin function in `server/src/services/ai/<feature>.ts`.
2. Call `createCompletion(...)` with:
   - a **bounded** system prompt (≤ 8000 chars),
   - a **whitelisted** model,
   - messages with sanitised user input where user content is involved.
3. Log enough structured context (`requestId`, `userId`, `sessionId` or equivalent) that spend and abuse can be attributed.
4. Consider cost. Add a rate limit or quota if the new surface is high-volume or unauthenticated.
5. Add at least one test against the mocked SDK (see `server/src/__tests__/aiClient.test.ts`).
6. Update this document if you've changed invariants.

## Data handling

- User prompts are stored in `ChatMessage.content` **per-user**. They are subject to the same GDPR subject-access and erasure obligations as any other user data.
- Anthropic's data-retention policy applies to prompts sent to their API. Do not send unrelated PII or secret material through the AI surface.
- Error contexts logged by pino redact `authorization`, `cookie`, `password`, `token`, and `apiKey` fields automatically (`pino` `redact` config in `server/src/lib/logger.ts`).

## Rotating the API key

Use this when the Anthropic key has expired, been revoked, or needs replacing for any reason. The server never stores the key in the DB — it reads `ANTHROPIC_API_KEY` from the environment on every startup.

1. Sign in at **https://console.anthropic.com** with the account that owns your billing.
2. **Billing → Usage limits** — set a monthly spend cap before issuing a key. A heavy AI-Assistant testing session runs $1–3, so a $20/mo cap is a safe dev default. Keys inherit the organisation's cap; no way to set per-key caps today.
3. **API Keys → Create Key**. Name it descriptively (`herm-dev-local-alice-2026-04`, `herm-prod-fly-2026-04`). You get **one chance** to copy the secret — it starts with `sk-ant-api03-` and is not shown again after the dialog closes.
4. Paste into the relevant environment:

   **Local:** edit `.env` at the repo root:
   ```
   ANTHROPIC_API_KEY="sk-ant-api03-…your new key…"
   ```
   Restart `npm run dev`. The server's startup log should no longer include the `ANTHROPIC_API_KEY` warning from `env-check.ts`.

   **Fly.io:** `fly secrets set ANTHROPIC_API_KEY="sk-ant-api03-…"` — triggers an automatic redeploy.

   **Render / other PaaS:** set via the provider's env-var UI and redeploy.

5. **Verify:** log in, open `/assistant`, ask a capability-coded question such as `"Which systems cover BC011 best?"`. A real reply citing specific systems means the key is live. The generic fallback message (_"AI Assistant requires an ANTHROPIC_API_KEY…"_) means the server still sees no key.
6. **Revoke the old key** in the Anthropic console once the new one is confirmed working. Do not leave superseded keys active.

### If the new key doesn't work

- **No surrounding quotes or trailing spaces in `.env`.** The file is read verbatim.
- **Confirm `.env` is gitignored:** `git check-ignore .env` → should print `.env`. If it prints nothing, stop and fix this before committing.
- **Model allowlist still valid?** `ai-client.ts` pins `claude-sonnet-4-20250514`. If Anthropic retires that model ID, calls fail with `AiLimitExceededError`. Check current model names at https://docs.anthropic.com/en/docs/about-claude/models and update `ALLOWED_MODELS` via a PR (see invariant #2 above).
- **Anthropic-side errors** (401, 429, 529) are logged server-side with status. Grep `npm run dev` output for `"Anthropic"` or `AiNotConfiguredError`.
- **Never paste the key** into a GitHub issue, PR, commit, chat log, or ticket. If one leaks, revoke it in the console immediately and issue a new one — that's why step 3 uses a descriptive name (makes the revoke target obvious).

## Incident response

### Abuse / prompt-injection suspected
1. Identify the session and user from structured logs (`sessionId`, `userId`, `requestId`).
2. Inspect the stored `ChatMessage` rows for that `sessionId`.
3. Consider disabling the user (flip a status on the `User` row) and, if warranted, clearing the session via `DELETE /api/chat/sessions/:sessionId`.

### Cost spike
1. Group `tokensIn + tokensOut` by `userId` over the spike window.
2. Identify top spenders and their `sessionId`s.
3. Lower `maxHistoryMessages` or tighten per-user rate-limit (follow-up work — not yet wired).

### Model deprecation
1. Update `ALLOWED_MODELS` in `ai-client.ts` to include the replacement.
2. Ship; observe both models in production.
3. Remove the deprecated model from the allowlist in a follow-up.
