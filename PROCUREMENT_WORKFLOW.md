# Procurement workflow & governance

This document is the operational reference for how procurement projects
move through the platform and how shortlist and scoring decisions are
made auditable. It complements [HERM_COMPLIANCE.md](./HERM_COMPLIANCE.md)
(which covers licensing + attribution) and [ARCHITECTURE_NOTES.md](./ARCHITECTURE_NOTES.md)
(which covers overall system design).

## Project status state machine

`ProcurementProject.status` is the canonical workflow state. The column
is a `String` in the schema for back-compat, but the allowed values and
transitions are enforced by `server/src/services/domain/procurement/project-status.ts`.

| State                     | Meaning                                                     |
|---------------------------|-------------------------------------------------------------|
| `draft`                   | Project scoped but not yet under active review.             |
| `active_review`           | Requirements captured and systems being assessed.           |
| `shortlist_proposed`      | A shortlist has been put forward for approval.              |
| `shortlist_approved`      | Governance signed off on the shortlist.                     |
| `recommendation_issued`   | Preferred-supplier recommendation published.                |
| `archived`                | Project closed; terminal — no further transitions.          |

### Allowed transitions

```
   draft
     │ startReview
     ▼
  active_review ──────────────────────────────────────► archived
     │ proposeShortlist
     ▼
  shortlist_proposed ──revise──► active_review         ► archived
     │ approveShortlist
     ▼
  shortlist_approved ──reopen──► shortlist_proposed    ► archived
     │ issueRecommendation
     ▼
  recommendation_issued ─────────────────────────────► archived
                                                        │ (terminal)
                                                        ▼
                                                     archived
```

- Forward moves flow through the happy path.
- `shortlist_proposed` can revise back to `active_review`.
- `shortlist_approved` can reopen back to `shortlist_proposed`.
- Any non-terminal state can be archived directly (a procurement
  cancelled mid-flight).
- Self-transitions are rejected.
- `archived` is terminal — no outgoing transitions.

### Legacy status mapping

Rows created before Phase 3 used different status strings. The server
normalises them when reading so the workflow keeps working without a
backfill migration:

| Legacy value              | Normalised to            |
|---------------------------|--------------------------|
| `active`                  | `active_review`          |
| `planning`                | `draft`                  |
| `complete` / `completed`  | `recommendation_issued`  |
| `cancelled`               | `archived`               |
| anything else             | `draft`                  |

The client mirrors the same normalisation in
`client/src/lib/project-status.ts::toProjectStatus`, plus `awarded →
recommendation_issued` to cover a v2 status that doesn't occur server-side.

### API

| Method | Path                                                        | Auth                | Purpose                        |
|--------|-------------------------------------------------------------|---------------------|--------------------------------|
| GET    | `/api/procurement/projects/:id/status`                      | optional JWT        | Current state + allowed next + transition history |
| POST   | `/api/procurement/projects/:id/status/transitions`          | **JWT required**    | `{ to, note? }` — run transition |

`PATCH /api/procurement/projects/:id` does **not** accept `status`. The
state machine is the only way to change it; a generic PATCH trying to
set `status` is dropped silently by the Zod schema (strip, not fail) so
existing clients that send extra fields don't break.

Transitions are race-safe: the service uses a conditional `updateMany`
inside a transaction, asserting the stored `status` still matches the
value we read. A concurrent transition that lands between our read and
write returns `count: 0`, and we surface the authoritative current
state as a fresh `InvalidTransitionError` so the client retries against
the new state rather than silently overwriting the winner.

A forbidden transition returns `409 INVALID_TRANSITION` with
`details: { from, to }` so the client can render a targeted error.
Every successful transition writes to `AuditLog`:

```json
{
  "action": "procurement.project.transition",
  "entityType": "ProcurementProject",
  "entityId": "<project-id>",
  "userId": "<jwt userId or null>",
  "changes": {
    "from": "draft",
    "to": "active_review",
    "note": "kick-off",
    "actorName": "Alice"
  }
}
```

History is surfaced at `GET /api/procurement/projects/:id/status`, where
each row is `{ at, actorId, actorName, from, to, note }` — `actorId` from
the AuditLog row itself, `actorName` parsed out of `changes` so operators
can display who performed a transition without an extra lookup.

## Shortlist decision governance

`ShortlistEntry` gained four additive columns in migration
`20260424000000_phase3_shortlist_governance`:

| Column            | Type      | Purpose                                     |
|-------------------|-----------|---------------------------------------------|
| `decisionStatus`  | `String`  | `'pending'` \| `'approved'` \| `'rejected'` |
| `rationale`       | `String?` | Why the entry was approved or rejected       |
| `decidedBy`       | `String?` | Reviewer attribution (name or userId)        |
| `decidedAt`       | `DateTime?` | Server-stamped decision timestamp          |

### API

| Method | Path                                                                       | Auth             | Purpose          |
|--------|----------------------------------------------------------------------------|------------------|------------------|
| POST   | `/api/procurement/projects/:id/shortlist/:entryId/decisions`               | **JWT required** | Approve / reject |
| DELETE | `/api/procurement/projects/:id/shortlist/:entryId/decisions`               | **JWT required** | Reset to pending |

All three governance mutations (status transition + approve/reject + clear)
require an authenticated JWT — anonymous mutations would write `null`
reviewer attribution into the AuditLog / `decidedBy`, defeating the
governance surface. Both mutations also scope by `(projectId, entryId)`
so a caller who learns an entry ID cannot decide on an entry that
belongs to a different project.

The approve/reject payload requires `rationale` (min length 1) — Phase
3's core policy is that every shortlist decision carries a written
justification. `decidedBy` is resolved from the caller's JWT `name` →
`userId` → optional body override, and `decidedAt` is stamped server-side
(clients cannot forge it).

Resetting a decision back to pending nulls `rationale`, `decidedBy`, and
`decidedAt` so a stale rationale never implies fresh approval.

## Scoring provenance

`CapabilityScore` already had the fields needed to make every score
defensible — Phase 3 surfaces them on the API surface that consumers
actually use.

| Field       | What it carries                                      |
|-------------|------------------------------------------------------|
| `evidence`  | Free-form justification string                       |
| `source`    | Origin of the score (e.g. `"RFI 2026-01"`)           |
| `scoredBy`  | Reviewer attribution                                 |
| `scoredAt`  | Timestamp of the score                               |
| `version`   | Lineage version number for a score                   |

### Where it surfaces

| Endpoint                                    | Where the fields appear                                        |
|---------------------------------------------|----------------------------------------------------------------|
| `GET /api/systems/:id/scores`               | `byDomain[*].capabilities[*].{evidence, source, scoredBy, scoredAt, version}` |
| `GET /api/capabilities/:code`               | `data.scores[*]` — full Prisma row (includes all provenance)    |
| `GET /api/systems/:id`                      | `data.scores[*]` — full Prisma row                             |

`byCode` on `/api/systems/:id/scores` is still a flat `{code → value}`
map — back-compat for clients that only read numeric values.

## Admin / operator visibility

- `<ProjectStatusPill />` (in `client/src/components/procurement/`) is the
  canonical renderer. Every place that shows a project's state should
  use it; colour + label + tooltip-description come from a single table.
- `<ShortlistDecisionBadge />` does the same for shortlist entries; the
  tooltip shows rationale, reviewer, and decision date inline.

## What's still advisory vs workflow-governed

**Workflow-governed** (Phase 3 enforces state + reviewer attribution):

- Project status transitions.
- Shortlist entry decisions with rationale.
- Capability scoring provenance on system/capability endpoints.

**Advisory** (still screen-only, no workflow enforcement yet — candidates
for Phase 4):

- `WorkflowStage` (the 8-stage `ProcurementWorkflow` model) — stage
  advance is free-form; not yet tied to project status transitions.
- `ProcurementEvaluation` recommendations (`award`/`shortlist`/
  `reserve`/`reject`) — per-evaluator, no cross-evaluator approval gate.
- `StageApproval` — stored but not enforced against transition.
- `ComplianceCheck` — stored but not a precondition on transition.
