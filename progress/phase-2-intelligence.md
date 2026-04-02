# Phase 2 — Intelligence Layer (Vendor Profiles, Research, AI Chat)
**Date**: 2026-04-02
**Status**: Complete
**Branch**: main

## What Was Done

### Part A — Prisma Schema Updates
- Added 6 new models to `prisma/schema.prisma`:
  - `VendorVersion` — tracks named releases per vendor system with optional changelog
  - `VersionScore` — per-version capability scores with change-from-previous delta
  - `VendorProfile` — rich vendor metadata (founded year, HQ, employees, market share, Gartner position, deployment models, tech stack, API standards, pricing, strengths/limitations, recent news)
  - `ResearchItem` — analyst reports, case studies, benchmarks, sector surveys with tags and relevant systems
  - `ScoringMethodology` — JSON content store for scoring model documentation, FAQs, evidence types, review process
  - `ChatMessage` — conversation history indexed by sessionId for the AI assistant

- Added relations to existing models:
  - `VendorSystem.profile` (one-to-one) → VendorProfile
  - `VendorSystem.versions` (one-to-many) → VendorVersion
  - `HermCapability.versionScores` (one-to-many) → VersionScore

### Part B — Seed: prisma/seeds/vendor-profiles.ts
- Exports `seedVendorProfiles(prisma)` function
- Upserts `VendorProfile` records for all 21 systems (Banner, SITS, Workday Student, Oracle Student Cloud, SAP, Colleague, PeopleSoft, Anthology Student, Unit4, Ellucian Student, Canvas, Blackboard, Moodle, Brightspace, Aula, Anthology Reach, Salesforce Education Cloud, campusM, Modern Campus, Workday HCM, SJMS)
- Creates 30 `ResearchItem` records covering: Gartner MQ, EDUCAUSE surveys, UCISA surveys, Jisc reviews, Forrester TEI studies, IDC market share reports, Omdia forecasts, 8 case studies, HESA/OfS compliance guides, LMS market benchmarks, HERM documentation, academic research papers
- Creates 4 `ScoringMethodology` records (scoring_model, evidence_types, review_process, faq) with rich structured JSON content

### Part C — New API Modules (server/src/api/)

#### vendors
- `vendors.router.ts` — GET /:id/profile, PUT /:id/profile, GET /:id/versions
- `vendors.service.ts` — Prisma queries for VendorProfile and VendorVersion with capability includes
- `vendors.controller.ts` — Request/response wrappers

#### research
- `research.router.ts` — GET / (filter by publisher/category/year/tags), GET /:id, POST /, PUT /:id, DELETE /:id
- `research.service.ts` — Full CRUD with filter support (Prisma `hasSome` for tags, `contains` for publisher)
- `research.controller.ts` — Request/response wrappers

#### scoring
- `scoring.router.ts` — GET /methodology, GET /faq, GET /evidence-types
- `scoring.service.ts` — Queries ScoringMethodology table by category
- `scoring.controller.ts` — Request/response wrappers

#### chat
- `chat.router.ts` — POST / (send message), GET /sessions/:sessionId, DELETE /sessions/:sessionId
- `chat.controller.ts` — Request/response wrappers

### Part C — AI Assistant Service (server/src/services/ai-assistant.ts)
- Graceful degradation when ANTHROPIC_API_KEY not set (returns helpful message pointing to platform features)
- Loads last 20 messages from ChatMessage table for conversation continuity
- Builds dynamic context from live VendorSystem scores (calculates % HERM coverage per system)
- Uses claude-sonnet-4-20250514 with HERM Procurement Assistant system prompt
- Saves both user and assistant messages to ChatMessage table after each exchange

### Part D — Environment
- Added `ANTHROPIC_API_KEY="sk-ant-..."` to `.env.example`

### Part E — Seed Integration
- `prisma/seed.ts` now calls `seedVendorProfiles(prisma)` at the end of main() via dynamic import
- Clean separation: vendor profiles are in their own seed file, not polluting the main seed

### server/index.ts
- Mounted 4 new routers:
  - `/api/vendors` → vendors router
  - `/api/research` → research router
  - `/api/scoring` → scoring router
  - `/api/chat` → chat router

### server/package.json
- Added `"@anthropic-ai/sdk": "^0.20.0"` to dependencies

## Files Created/Modified
- `prisma/schema.prisma` (modified — 6 new models, 3 relation additions)
- `prisma/seeds/vendor-profiles.ts` (new)
- `prisma/seed.ts` (modified — added seedVendorProfiles call)
- `server/src/api/vendors/vendors.router.ts` (new)
- `server/src/api/vendors/vendors.service.ts` (new)
- `server/src/api/vendors/vendors.controller.ts` (new)
- `server/src/api/research/research.router.ts` (new)
- `server/src/api/research/research.service.ts` (new)
- `server/src/api/research/research.controller.ts` (new)
- `server/src/api/scoring/scoring.router.ts` (new)
- `server/src/api/scoring/scoring.service.ts` (new)
- `server/src/api/scoring/scoring.controller.ts` (new)
- `server/src/api/chat/chat.router.ts` (new)
- `server/src/api/chat/chat.controller.ts` (new)
- `server/src/services/ai-assistant.ts` (new)
- `server/src/index.ts` (modified — 4 new router imports and mounts)
- `server/package.json` (modified — added @anthropic-ai/sdk)
- `.env.example` (modified — added ANTHROPIC_API_KEY)
- `progress/phase-2-intelligence.md` (new)

## Verification
- [x] `prisma validate` — schema valid (Prisma CLI Version 5.22.0 confirmed)
- [x] All 21 vendor profiles defined in seed
- [x] 30 research items defined in seed
- [x] 4 scoring methodology records defined in seed
- [x] AI assistant degrades gracefully without API key
- [x] Chat history persisted per sessionId

## API Endpoints Added
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/vendors/:id/profile | Get vendor profile |
| PUT | /api/vendors/:id/profile | Update vendor profile |
| GET | /api/vendors/:id/versions | Get vendor version history |
| GET | /api/research | List research items (filter: publisher, category, year, tags) |
| GET | /api/research/:id | Get research item by ID |
| POST | /api/research | Create research item |
| PUT | /api/research/:id | Update research item |
| DELETE | /api/research/:id | Delete research item |
| GET | /api/scoring/methodology | Get scoring model documentation |
| GET | /api/scoring/faq | Get FAQ content |
| GET | /api/scoring/evidence-types | Get evidence types documentation |
| POST | /api/chat | Send AI chat message |
| GET | /api/chat/sessions/:sessionId | Get chat history |
| DELETE | /api/chat/sessions/:sessionId | Clear chat history |

## Next Task
Phase 3 — Procurement Workflow, TCO Calculator

---

## Part F — Frontend Wiring (2026-04-02)
**Status**: Complete

### New Pages
- `client/src/pages/VendorShowcase.tsx` — Grid of all 21 systems with search, category and deployment filters; navigates to VendorProfile on click
- `client/src/pages/VendorProfile.tsx` — Full profile view: company info, technical specs, commercial info, strengths/limitations, HERM coverage bars, quick-action buttons
- `client/src/pages/HowItWorks.tsx` — Tabbed content: Scoring Model (0/50/100 detail + formula), Evidence Types, Review Process (6 steps), FAQ (15 items)
- `client/src/pages/ResearchHub.tsx` — Filterable grid of research items by category and publisher; inline detail view
- `client/src/pages/AiAssistant.tsx` — Full chat UI with suggested starters, session controls, typing indicator, keyboard shortcuts

### Updated Files
- `client/src/App.tsx` — 5 new routes: /vendor, /vendor/:id, /how-it-works, /research, /assistant
- `client/src/components/layout/Sidebar.tsx` — Restructured into 3 sections (Analytics, Intelligence, Admin) with 12 nav items; section dividers
- `client/src/lib/api.ts` — 9 new API methods; 4 new type imports
- `client/src/types/index.ts` — 5 new interfaces: VendorProfile, VendorSystemWithProfile, ResearchItem, ChatMessage, ScoringMethodology
- `client/src/hooks/useApi.ts` — 6 new hooks: useVendorProfile, useResearch, useResearchItem, useMethodology, useFaq, useEvidenceTypes
