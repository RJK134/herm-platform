# Phase 3 — TCO Calculator, Procurement Workflow, Integration Assessment
**Date**: 2026-04-02
**Status**: Complete
**Branch**: main

## What Was Built

### Part A — Prisma Schema Additions
- Added 5 new models to `prisma/schema.prisma`:
  - `TcoEstimate` — persists saved TCO calculations with full cost breakdown
  - `ProcurementWorkflow` — 8-stage workflow linked 1:1 to a project
  - `WorkflowStage` — individual stage records with status, notes, completedAt
  - `ShortlistEntry` — vendor shortlist linked to project and VendorSystem
  - `IntegrationAssessment` — architecture compatibility assessment records
- Updated `ProcurementProject` with `workflow` and `shortlist` relations
- Updated `VendorSystem` with `tcoEstimates`, `shortlistEntries`, `integrationTargets` relations
- Schema pushed to PostgreSQL via `prisma db push`

### Part B — TCO Benchmark Data
- Created `server/src/data/tco-benchmarks.ts` with:
  - `TCO_BENCHMARKS` lookup with 21 UK HE systems (realistic GBP figures)
  - `calculateTco()` function with 3% annual growth modelling
  - Full type definitions: `TcoBenchmark`, `TcoResult`

### Part C — API Endpoints (3 new modules)

**TCO API** (`/api/tco`)
- `GET /benchmarks` — all 21 system benchmarks
- `GET /benchmarks/:slug` — single benchmark
- `POST /calculate` — calculate TCO for one system
- `POST /compare` — compare multiple systems (sorted by TCO, names resolved from DB)
- `POST /estimates` — save estimate to DB
- `GET /estimates` — list saved estimates
- `GET /estimates/:id` — get estimate detail

**Procurement API** (`/api/procurement`)
- Full CRUD on projects (create auto-triggers workflow + 8 stages in DB transaction)
- Workflow management: get, advance stage, update stage notes/status
- Shortlist management: add, list, update, remove entries

**Integration API** (`/api/integration`)
- `POST /assess` — create assessment with auto-scoring
- `GET /assess` — list assessments
- `GET /assess/:id` — get assessment detail
- Scoring algorithm: base 20 + 5/system + 10 for Proprietary/None APIs + 15 if no protocol overlap + 10 if cloud-native vs on-prem majority
- Auto-generates risks, opportunities, and recommendations as JSON findings

### Part D — React Pages (3 new)

**TcoCalculator** (`/tco`)
- Single-system and compare modes (up to 6 systems)
- Institution size presets (Small/Medium/Large/XL) plus custom count
- Time horizons: 3, 5, 7, 10 years
- Results: 3 KPI cards, Doughnut breakdown chart, Line cumulative spend chart
- Compare mode: horizontal Bar chart + sortable comparison table
- Disclaimer panel about indicative nature of benchmarks

**ProcurementWorkflow** (`/procurement`)
- Project list sidebar with create modal
- 8-stage progress bar (green=complete, teal=active, grey=pending)
- Stage cards with descriptions, expected outputs, status icons
- Advance workflow button (marks current complete, activates next, DB transaction)
- Add notes modal per active stage
- Completed stages show completion date

**IntegrationAssessment** (`/integration`)
- 4-step wizard: Name > Current Stack > Target System > Results
- Step 2: add/remove current systems with name, category, API support
- Step 3: target system selection from 21 systems
- Step 4: complexity score bar (red/amber/green), risk badge, risk/recommendation/opportunity cards
- "Systems Assessed" table with colour-coded API support badges

### Part E — Client Updates
- `client/src/lib/api.ts` — added 15 new API methods (TCO, Procurement, Integration)
- `client/src/lib/utils.ts` — added `formatCurrency()` (GBP, K/M suffix)

### Part F — Sidebar and Routing
- `Sidebar.tsx` — added Calculator, Briefcase, Network icons + 3 nav items to Analytics section
- `App.tsx` — added 3 new routes: `/tco`, `/procurement`, `/integration`

## Files Created
- `server/src/data/tco-benchmarks.ts`
- `server/src/api/tco/tco.service.ts`
- `server/src/api/tco/tco.schema.ts`
- `server/src/api/tco/tco.controller.ts`
- `server/src/api/tco/tco.router.ts`
- `server/src/api/procurement/procurement.schema.ts`
- `server/src/api/procurement/procurement.service.ts`
- `server/src/api/procurement/procurement.controller.ts`
- `server/src/api/procurement/procurement.router.ts`
- `server/src/api/integration/integration.schema.ts`
- `server/src/api/integration/integration.service.ts`
- `server/src/api/integration/integration.controller.ts`
- `server/src/api/integration/integration.router.ts`
- `client/src/pages/TcoCalculator.tsx`
- `client/src/pages/ProcurementWorkflow.tsx`
- `client/src/pages/IntegrationAssessment.tsx`
- `progress/phase-3-procurement.md`

## Files Modified
- `prisma/schema.prisma`
- `server/src/index.ts`
- `client/src/lib/api.ts`
- `client/src/lib/utils.ts`
- `client/src/App.tsx`
- `client/src/components/layout/Sidebar.tsx`

## TypeScript Status
- Server: 1 pre-existing error in `vendors.service.ts` (not introduced by Phase 3)
- Client: 2 pre-existing error files (`AdminSystems.tsx`, `SystemDetail.tsx`, not introduced by Phase 3)
- All Phase 3 files: 0 TypeScript errors

## Database Status
- Schema pushed successfully via `prisma db push`
- Prisma Client regenerated (v5.22.0)
- 5 new tables created: TcoEstimate, ProcurementWorkflow, WorkflowStage, ShortlistEntry, IntegrationAssessment

## Next Steps
- Phase 4 candidates: Basket-to-shortlist integration, TCO estimate save from calculator UI, comparison export to PDF
- Consider adding authentication guard to procurement/TCO write endpoints
