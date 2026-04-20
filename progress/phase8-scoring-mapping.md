# Phase 8 — Framework-Aware Scoring, FHE Scores & Framework Mapping
**Date**: 2026-04-10
**Status**: Complete
**Branch**: main

## Problem Addressed
After Phases 1-6, three blockers prevented the paid tier from being usable:
1. `scores.service.ts` hardcoded `version: 1` and never filtered by `frameworkId` — switching to FHE still showed HERM data
2. FHE had 0 `CapabilityScore` records against its 118 capabilities × 21 systems
3. No mapping tool existed for Enterprise users to bridge HERM ↔ FHE

## Part A — Framework-Aware Leaderboard (Bug Fix)

**Files modified:**
- `server/src/api/scores/scores.service.ts` — added `resolveFramework()`; both `getLeaderboard()` and `getHeatmap()` now accept optional `frameworkId` and filter all queries by it; capability count denominator dynamic
- `server/src/api/scores/scores.controller.ts` — extracts `?frameworkId=` from query
- `server/src/api/export/export.service.ts` + controller — same frameworkId threading for CSV/JSON exports
- `server/src/api/baskets/baskets.service.ts` — fixed `capability.findUnique` → `findFirst` (code is no longer unique without frameworkId)
- `server/src/api/vendors/vendors.service.ts` — `family` → `domain` include (stale reference)
- `client/src/lib/api.ts` — `getLeaderboard`/`getHeatmap` accept optional frameworkId; added framework + framework-mapping endpoints
- `client/src/hooks/useApi.ts` — hooks accept frameworkId, included in query key for cache invalidation
- `client/src/pages/Leaderboard.tsx` — passes `activeFramework?.id` to hook
- `client/src/pages/CapabilityHeatmap.tsx` — passes `activeFramework?.id` to hook

## Part B — FHE Scoring (Hybrid Rules + Manual)

**Files created:**
- `server/src/data/fhe-scoring-rules.ts` — 107 deterministic scoring rules across 8 domains, using only vendor metadata (apiStandards, integrationProtocols, certifications, category, cloudNative). Helpers: `hasAny`, `hasAll`, `countMatches`, `isCategory`, `cloudBonus`.
- `server/src/data/fhe-manual-scores.ts` — 1,148 curated manual overrides across 21 systems (~55 per system). Covers RO, PC, EN domains where rules can't decide; vendor-specific differentiators (SJMS HESA, Banner Title IV, Workday unified, Salesforce Einstein, etc.)
- `server/src/data/fhe-scoring-rules.test.ts` — 43 tests for helpers + 10 rule-specific tests + 4 catalogue invariants
- `prisma/seeds/fhe-scores.ts` — resolves in order: manual → rule → default 0; bulk inserts via `createMany`; logs breakdown by source

**Seed results:**
- **2,478 FHE scores** (21 systems × 118 capabilities)
- manual-v1: 1,148 (46.3%)
- rules-v1: 1,087 (43.9%)
- default: 243 (9.8%)

**Top 5 FHE leaderboard:**
1. Workday Student — 48.3%
2. Salesforce Education Cloud — 45.8%
3. Workday HCM — 44.5%
4. SAP Student Lifecycle Mgmt — 43.6%
5. Unit4 Student Management — 43.6%

## Part C — Framework Mapping (Enterprise Tier)

**Schema additions (`prisma/schema.prisma`):**
- `FrameworkMapping` — pairs two frameworks; stores name, description, mappingType (official/community/custom)
- `CapabilityMapping` — individual source→target mappings with strength (exact/strong/partial/weak) and confidence (0-100)
- Back-relations added to `Framework` and `Capability`

**Files created:**
- `server/src/data/herm-to-fhe-mapping.ts` — 132 hand-curated HERM→FHE mappings across all 11 HERM families
- `prisma/seeds/framework-mappings.ts` — idempotent seed using upsert + deleteMany + createMany
- `server/src/api/framework-mappings/framework-mappings.service.ts` — list/getById/lookup methods
- `server/src/api/framework-mappings/framework-mappings.router.ts` — Enterprise-gated endpoints via `requireEnterprise` inline middleware
- `server/src/api/framework-mappings/framework-mappings.test.ts` — 13 tests covering tier gating, 404s, lookup behaviour
- `client/src/pages/FrameworkMapping.tsx` — two-column source→target table with mapping selector, strength filter, search, and lock screen for non-Enterprise users

**Mapping strength distribution:**
- exact: 53
- strong: 54
- partial: 19
- weak: 6
- **Total: 132 mappings across all 11 HERM families**

**Files modified:**
- `server/src/app.ts` — registered `frameworkMappingsRouter` at `/api/framework-mappings`
- `prisma/seed.ts` — wires `seedFheScores` and `seedFrameworkMappings` into main seed
- `client/src/App.tsx` — registered `/framework-mapping` route
- `client/src/components/layout/Sidebar.tsx` — added "Framework Mapping" link under Insights

## Verification Results

| Check | Expected | Actual |
|-------|----------|--------|
| `GET /api/health` | ok | ✅ ok |
| `GET /api/frameworks` (anonymous) | HERM only | ✅ 1 framework |
| `GET /api/scores/leaderboard?frameworkId=<herm>` | HERM 11 domains + CC licence | ✅ |
| `GET /api/scores/leaderboard?frameworkId=<fhe>` | FHE 8 domains + no licence | ✅ |
| `GET /api/framework-mappings` (anonymous) | 403 | ✅ 403 |
| `npm test` | 100+ tests | ✅ **102 tests, 9 suites, 0 failures** |
| DB: FHE scores | 2,478 | ✅ 2,478 |
| DB: CapabilityMapping records | ≥80 | ✅ 132 |
| Server TypeScript compile | 0 errors | ✅ |
| Client TypeScript compile | 0 errors | ✅ |

## File Change Summary

| Layer | New Files | Modified Files |
|-------|-----------|----------------|
| Schema | 0 | 1 (`schema.prisma`) |
| Data | 3 (rules, manual, herm-to-fhe) | 0 |
| Seeds | 2 (fhe-scores, framework-mappings) | 1 (`seed.ts`) |
| API | 3 (framework-mappings router+service+test) | 5 (scores ×2, export ×2, baskets, vendors, app.ts) |
| Frontend | 1 (`FrameworkMapping.tsx`) | 5 (api.ts, useApi.ts, Leaderboard, CapabilityHeatmap, App.tsx, Sidebar) |
| Tests | 2 (`fhe-scoring-rules.test.ts`, `framework-mappings.test.ts`) | 0 |

## Test Growth
- Before Phase 8: 46 tests, 7 suites
- After Phase 8: **102 tests, 9 suites** (+56 tests)

## Next Steps
- Score vendor systems against more FHE capabilities to push manual/rules ratio above 95%
- Build framework mapping editor for Enterprise users to create custom mappings
- Add exact-mapping preservation check to prevent FHE scores from accidentally flowing to HERM leaderboard
- Legal review of FHE taxonomy originality before charging for it
