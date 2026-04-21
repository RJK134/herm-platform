# Phase 7 — Multi-Framework Transformation
**Date**: 2026-04-10
**Status**: Complete
**Branch**: main

## What Was Done

### Business Context
HERM (CAUDIT, CC BY-NC-SA 4.0) was hardcoded as the platform's data foundation. A licensing review found that charging for a platform whose core content is HERM data likely violates the NonCommercial clause. The platform was restructured into a multi-framework architecture with tiered licensing.

### Phase 1 — Schema Transformation
- Added `Framework` root model (slug, name, version, publisher, licenceType, isPublic, isDefault)
- Renamed `HermFamily` → `FrameworkDomain` (with `frameworkId` FK)
- Renamed `HermCapability` → `Capability` (with `frameworkId`, `domainId`, hierarchy support)
- Renamed `Score` → `CapabilityScore` (with `frameworkId` FK)
- Renamed `hermScore` → `frameworkScore` in ProcurementEvaluation
- Renamed `familyId` → `domainId` in EvaluationDomainAssignment
- Added `frameworkId` to CapabilityBasket, EvaluationProject, VersionScore

### Phase 2 — API Refactoring
- Created `GET /api/frameworks` — tier-aware framework listing
- Created `GET /api/frameworks/:id` — framework detail with domains
- Created `server/src/middleware/framework-context.ts` — resolves frameworkId
- Created `server/src/middleware/tier-gate.ts` — enforces subscription tier access
- Created `server/src/utils/licence.ts` — CC licence metadata helper
- Added licence metadata to leaderboard and capabilities API responses
- Updated 13 API files with new model names (zero old references remaining)

### Phase 3 — Frontend Transformation
- Created `FrameworkContext` with `useFramework()` hook
- Created `LicenceAttribution` component (CC BY-NC-SA 4.0 banner)
- Updated Sidebar: dynamic framework name, capability count, framework selector
- Updated Leaderboard: dynamic labels, attribution banner
- Updated CapabilityHeatmap + CapabilityView: dynamic framework references
- Wrapped App.tsx with FrameworkProvider

### Phase 4 — FHE Proprietary Taxonomy
- Created 8 domains, 118 capabilities (FHE-XX-NNN coding scheme)
- Domains: Digital Learning Infrastructure, Student Lifecycle Operations, Institutional Intelligence, Research Operations, Governance Risk & Compliance, Enterprise Technology, People & Culture, Engagement & Communications
- Zero textual overlap with HERM capability names
- Seeded via `prisma/seeds/fhe-framework.ts`

### Phase 5 — Tier Enforcement
- Free tier: HERM only (isPublic=true), read-only
- Paid tier: all frameworks including FHE (isDefault=true)
- Enterprise: benchmarking, APIs, custom frameworks
- Platform independence verified: FHE has 118 capabilities independent of HERM

### Phase 6 — Testing
- Framework service tests (anonymous vs paid tier access)
- Tier-gate middleware tests (5 scenarios)
- Licence utility tests (CC vs proprietary)

## Database State
```
Frameworks:    2 (HERM v3.1 + FHE v1.0)
HERM Domains:  11
HERM Caps:     165
FHE Domains:   8
FHE Caps:      118
Systems:       21
Scores:        3,465
```

## Files Created
- `prisma/schema.prisma` — Framework model + renamed models
- `server/src/api/frameworks/frameworks.router.ts`
- `server/src/api/frameworks/frameworks.test.ts`
- `server/src/middleware/framework-context.ts`
- `server/src/middleware/tier-gate.ts`
- `server/src/middleware/tier-gate.test.ts`
- `server/src/utils/licence.ts`
- `server/src/utils/licence.test.ts`
- `server/src/data/fhe-framework.ts`
- `prisma/seeds/fhe-framework.ts`
- `client/src/contexts/FrameworkContext.tsx`
- `client/src/components/LicenceAttribution.tsx`

## Files Modified
- `prisma/seed.ts` — Framework creation, new model names
- `server/src/app.ts` — frameworks router registered
- 13 API files — all old model references replaced
- `client/src/App.tsx` — FrameworkProvider wrapping
- `client/src/components/layout/Sidebar.tsx` — dynamic framework name
- `client/src/pages/Leaderboard.tsx` — dynamic labels + attribution
- `client/src/pages/CapabilityHeatmap.tsx` — dynamic labels + attribution
- `client/src/pages/CapabilityView.tsx` — dynamic labels + attribution

## Verification Checklist
- [x] `npx prisma validate` passes
- [x] `GET /api/frameworks` returns HERM (public) for anonymous, all for paid
- [x] `GET /api/scores/leaderboard` includes CC licence metadata
- [x] FHE framework: 8 domains, 118 capabilities, independent of HERM
- [x] Platform independence: FHE works without HERM loaded
- [x] Free tier sees only HERM, paid tier sees all frameworks
- [x] CC BY-NC-SA attribution in API responses and frontend banner
- [x] Zero hardcoded "HERM" strings in Sidebar/Leaderboard/Heatmap/CapabilityView

## Next Steps
- Seek written permission from CAUDIT for commercial adjacency to HERM data
- Legal review of FHE taxonomy originality
- Add framework scoring for FHE capabilities (currently no vendor scores for FHE)
- Build framework mapping/bridge tools for Enterprise tier
