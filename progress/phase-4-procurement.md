# Phase 4 — Multi-Jurisdiction Procurement Engine

**Date**: 2026-04-02
**Status**: Complete ✅
**Commit**: 6162197
**Branch**: master

---

## What Was Built

### Core Differentiator
A fully featured multi-jurisdiction procurement workflow engine — the first HERM-aligned procurement automation tool with jurisdiction-specific compliance enforcement.

### Database Changes
- **ProcurementProject** extended with: `estimatedValue`, `procurementRoute`, `startDate`, `targetAwardDate`, `description`, + 3 relation arrays
- **7 new Prisma models**: `ProcurementJurisdiction`, `ProcurementStage`, `StageTask`, `StageApproval`, `StageDocument`, `ProcurementEvaluation`, `ComplianceCheck`
- **StageStatus enum**: `NOT_STARTED` → `IN_PROGRESS` → `AWAITING_APPROVAL` → `COMPLETED | SKIPPED | BLOCKED`
- Schema validated ✅, generated ✅, pushed to PostgreSQL ✅

### Jurisdiction Data Seeded
| Code | Legislation | Threshold (G/S) | Standstill | Platform |
|------|-------------|---------|-----------|----------|
| UK | Procurement Act 2023 | £139,688 | 8 days | Find a Tender |
| EU | Directive 2014/24/EU | €221,000 | 10 days | TED |
| US_FEDERAL | FAR | $250,000 simplified | None | SAM.gov |
| US_STATE | ABA Model Code | $50,000 | None | State register |
| AU | CPRs 2023 | AUD 80,000 | None | AusTender |

### Procurement Engine Service
`server/src/services/procurement-engine.ts`

- **UK**: 7 stages — Planning, Market Engagement, Specification, Notice (30d min), Evaluation, Standstill (8d), Award
- **EU**: 6 stages — Planning, Specification, Notice/TED (35d), Evaluation, Standstill (10d), Award
- **US Federal**: 5 stages — Market Research, Specification, Solicitation/SAM.gov (30d), Evaluation, Award
- **Australia**: 6 stages — Planning, Market Analysis, Specification, ATM/AusTender (25d), Evaluation, Award

Key methods:
- `createProjectWithStages()` — atomic Prisma transaction: project + stages + tasks + approvals
- `generateTimeline()` — date schedule respecting all minimum periods
- `runComplianceCheck()` — validates mandatory tasks + pending approvals before stage advance
- `advanceStage()` — compliance gate enforced
- `hermToSpecification()` — basket items → MoSCoW requirement sections by HERM family
- `evaluationScoring()` — weighted MEAT scoring with automatic recommendation (award/shortlist/reserve/reject)

### API Endpoints (14 new)
```
POST   /api/procurement/v2/projects               — Create with auto-generated stages
GET    /api/procurement/v2/projects               — List with stage summaries
GET    /api/procurement/v2/projects/:id           — Full detail (stages, tasks, approvals, evaluations)
POST   /api/procurement/v2/projects/:id/advance   — Compliance-gated stage advancement
PATCH  /api/procurement/v2/.../tasks/:taskId      — Complete/update task
PATCH  /api/procurement/v2/.../approvals/:id      — Approve/reject
GET    /api/procurement/v2/projects/:id/compliance — Compliance check results
GET    /api/procurement/v2/projects/:id/timeline  — Stage timeline with dates
POST   /api/procurement/v2/projects/:id/evaluations — Add system to evaluation
GET    /api/procurement/v2/projects/:id/evaluations — All evaluations with scores
PATCH  /api/procurement/v2/projects/:id/evaluations/:id — Update scores (auto-calculates overall)
GET    /api/procurement/v2/projects/:id/specification — HERM-to-requirements translation
GET    /api/procurement/jurisdictions             — All 5 jurisdictions
GET    /api/procurement/jurisdictions/:code       — Jurisdiction detail
```
All v1 routes preserved for backward compatibility.

### React Pages

**ProcurementProjects.tsx** (1,378 lines, 4 tabs):
- Tab 1: Project card grid with jurisdiction flags + stage progress bars + 5-step Create wizard
- Tab 2: Visual pipeline (connected stage nodes in green/blue/amber/gray) + stage detail with task checklist, approval buttons, compliance results, Advance Stage CTA
- Tab 3: Gantt-style timeline with statutory period indicators
- Tab 4: MEAT evaluation matrix — 5 weighting sliders (must sum to 100%), score inputs, auto-calculated weighted totals, ranked bar chart

**ProcurementGuide.tsx** (3 sections):
- Interactive decision tree: jurisdiction → estimated value → procurement type → recommended route + timeline estimate
- Jurisdiction comparison table: 5-column side-by-side with thresholds, timelines, notices, standstill
- Stage-by-stage guide: accordion per stage with roles, documents, compliance requirements, minimum duration

### Navigation
- New "Procurement Engine" sidebar section
- Routes: `/projects` (ProcurementProjects) + `/guide` (ProcurementGuide)
- All existing routes unchanged

---

## Files Created/Modified

### New files (9):
- `client/src/pages/ProcurementProjects.tsx`
- `client/src/pages/ProcurementGuide.tsx`
- `prisma/seeds/jurisdictions.ts`
- `server/src/api/procurement/procurement-engine.controller.ts`
- `server/src/services/procurement-engine.ts`
- `progress/phase-4-procurement.md` (this file)

### Modified files (7):
- `prisma/schema.prisma` — 7 new models + extended ProcurementProject
- `server/src/api/procurement/procurement.schema.ts` — Phase 4 Zod schemas
- `server/src/api/procurement/procurement.router.ts` — v2 + jurisdiction routes
- `client/src/App.tsx` — 2 new routes
- `client/src/components/layout/Sidebar.tsx` — Procurement Engine section
- `client/src/lib/api.ts` — 14 new API methods
- `package.json` — `db:seed:jurisdictions` script

---

## Verification Checklist

- [x] `npx prisma validate` — schema valid
- [x] `npx prisma generate` — client generated
- [x] `npx prisma db push` — tables created in PostgreSQL
- [x] `npx tsx prisma/seeds/jurisdictions.ts` — all 5 jurisdictions seeded
- [x] `npx tsc --noEmit -p server/tsconfig.json` — 0 errors
- [x] `npx tsc --noEmit -p client/tsconfig.json` — 0 new errors (2 pre-existing in AdminSystems/SystemDetail unchanged)
- [x] Git commit: `6162197` — 12 files, 3,825 insertions

---

## Next Priorities (Phase 5 candidates)

1. **HESA Data Futures Export** — XML generation validating against HESA XSD schema
2. **TEF/OfS Metrics Dashboard** — continuation, completion, progression rates
3. **Contract Register** — post-award contract management, milestone tracking
4. **Supplier Portal** — vendor self-service for capability claims and evidence upload
5. **Multi-tenancy** — institution isolation for data, projects, evaluations
