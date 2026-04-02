# Phase 5 — Commercial Platform: Vendor Portal, Stripe Subscriptions & Team Workspaces

**Date**: 2026-04-02
**Status**: Complete ✅
**Commit**: 980d777
**Branch**: master

---

## What Was Built

### Core Differentiator
Full commercial platform layer: vendors can self-register and manage their presence, institutions subscribe to Pro/Enterprise tiers, and evaluation teams can collaborate on multi-system assessments with domain-assigned scoring.

---

## Database Changes

### New Prisma Models (12)
| Model | Purpose |
|-------|---------|
| `VendorAccount` | Vendor company record with tier (BASIC/ENHANCED/PREMIUM), status, systemId link |
| `VendorUser` | Vendor portal users (separate auth from institution users) |
| `VendorSubmission` | Score challenges, profile updates, new system registrations |
| `VendorAnalytic` | Monthly profile views, comparison inclusions, basket inclusions |
| `EvaluationProject` | Collaborative evaluation workspace — up to 21 systems, team members, domain assignments |
| `EvaluationSystem` | System entries within an evaluation project |
| `EvaluationMember` | Team members with roles: lead/evaluator/observer/finance |
| `EvaluationDomainAssignment` | HERM family → evaluator assignment with completion tracking |
| `EvaluationDomainScore` | Individual capability scores (0/50/100) within an assignment |
| `Payment` | Stripe payment records linked to Subscription |
| `VendorTier` enum | BASIC / ENHANCED / PREMIUM |

### Relations Added to Existing Models
- `Institution` → `evaluationProjects EvaluationProject[]`
- `Subscription` → `payments Payment[]`
- `User` → `evaluationMemberships` + `domainAssignments`
- `HermFamily` → `domainAssignments EvaluationDomainAssignment[]`
- `VendorSystem` → `vendorAccount VendorAccount?` + `evaluationEntries EvaluationSystem[]`

Schema validated ✅, generated ✅, pushed to PostgreSQL ✅

---

## Backend Services & APIs

### Stripe Service (`server/src/services/stripe.ts`)
- Graceful no-op pattern: returns `{ configured: false, message }` if `STRIPE_SECRET_KEY` not set
- `createCheckoutSession()` — creates Stripe Checkout session for institution/vendor tiers
- `handleWebhook()` — processes `checkout.session.completed` (updates Subscription/VendorAccount tier + creates Payment) and `customer.subscription.deleted` (downgrades to FREE/BASIC)
- `cancelSubscription()`, `getSubscriptionStatus()`, `getInvoices()`
- Pricing: Institution Pro £2,500/yr, Enterprise £8,000/yr; Vendor Enhanced £3,500/yr, Vendor Premium £12,000/yr

### Vendor Portal API (`/api/vendor-portal`)
- `POST /register` — creates VendorAccount + VendorUser + JWT (type:'vendor')
- `POST /login` — authenticates vendor, returns JWT
- `GET /me` — returns VendorUser from token
- `GET /profile` — VendorAccount with linked system
- `PUT /profile` — update company info
- `GET /scores` — system scores grouped by HERM family
- `GET /analytics` — monthly KPIs + 6-month trend data
- `POST /submissions` — score challenges, profile updates, new system requests
- `GET /submissions` — list vendor's own submissions

### Evaluations API (`/api/evaluations`)
- `POST /` — create project (atomic: project + systems + lead member)
- `GET /` — list projects for institution
- `GET /:id` — full project detail (systems, members, domain assignments + scores)
- `PATCH /:id` — update project metadata
- `POST /:id/members` — add member by userId or email
- `DELETE /:id/members/:memberId` — remove member
- `POST /:id/systems` — add system to evaluation
- `DELETE /:id/systems/:sysId` — remove system
- `POST /:id/domains/assign` — bulk assign HERM families to evaluators
- `GET /:id/domains` — domain progress with per-family completion %
- `POST /:id/domains/:domainId/scores` — submit capability scores (auto-marks complete when all caps × systems scored)
- `GET /:id/aggregate` — aggregated system rankings with variance flags
- `GET /:id/progress` — per-member progress stats

### Subscriptions API (`/api/subscriptions`)
- `GET /me` — current subscription + tier
- `POST /checkout` — create Stripe Checkout session (or no-op message)
- `POST /cancel` — cancel subscription (via Stripe or direct status update)
- `GET /invoices` — payment history

### Admin Vendor API (`/api/admin`)
- `GET /vendors` — list all vendor accounts with search + status filter
- `GET /vendors/:id` — vendor detail + submissions + system info
- `PATCH /vendors/:id` — update status/tier/system link
- `GET /vendors/submissions` — all pending/reviewed submissions
- `PATCH /vendors/submissions/:id` — approve/reject/request-changes

---

## React Pages (4 new)

### VendorPortal.tsx
- Self-contained vendor auth (uses `vendor_auth_token` in localStorage, independent of institution JWT)
- Not logged in: side-by-side login / register panels
- Dashboard tab: KPI cards (HERM score, profile views, comparison inclusions, basket inclusions), 6-month CSS bar trend chart, recent submissions table
- My Profile tab: editable form (company name, contact, website, phone, description), system link display
- HERM Scores tab: overall score + progress bar, accordion by family, per-capability score chips (0/50/100), "Challenge" button → modal with evidence submission
- Subscription tab: current tier badge, feature comparison table (BASIC/ENHANCED/PREMIUM), upgrade buttons → Stripe checkout, submissions history

### TeamWorkspaces.tsx
- Tab 1 (Projects): project cards with progress bars, "New Evaluation Project" modal (system multi-select, member emails, basket link, deadline)
- Tab 2 (Domain Assignment): per-family assignee dropdowns, auto-assign button, "Enter Scores" for in-progress domains with capability × system scoring grid
- Tab 3 (Team Progress): member cards with CSS circular progress indicators, per-member stats (domains assigned, completed, scores submitted, average score)
- Tab 4 (Results): ranked system list (gold/silver/bronze labels), expandable family score breakdown bars, high-variance warnings (stddev > 30), "Finalise → Documents" CTA

### AdminVendors.tsx
- 2-column layout: vendor list sidebar (⅓) + detail panel (⅔)
- Sidebar: search input, status tab filter (All/Pending/Approved/Submissions)
- Stats panel (no selection): total vendors, pending/approved/submissions counts + CSS status bar chart
- Vendor detail panel: contact info, status badge, system link dropdown, tier selector, approve/reject/suspend action buttons, submissions table with approve/reject/request-changes per row

### Subscriptions.tsx
- Current plan card: tier badge, renewal date, "Manage on Stripe" link, cancel with confirm dialog
- Tier comparison table: Free / Professional £2,500/yr / Enterprise £8,000/yr — feature matrix with boolean ticks and string values
- Upgrade CTA buttons: POST /api/subscriptions/checkout; if configured=false shows modal; if url returned redirects
- Payment history table: date, formatted GBP amount, status badge, invoice link

---

## Navigation Changes

**Sidebar restructured into 4 sections:**

| Section | Items |
|---------|-------|
| Analytics | Leaderboard, Radar, Heatmap, System Detail, Capability View, Basket, TCO, Integration, Architecture, Value |
| Procurement | Procurement Projects, Guide, Team Workspaces, Document Generator, Procurement Workflow |
| Intelligence | Vendor Showcase, Vendor Portal, How It Works, Research, AI Assistant |
| Admin | Systems Management, Vendor Management, Subscriptions, Export & Download |

---

## Files Created/Modified

### New files (17):
- `client/src/pages/VendorPortal.tsx`
- `client/src/pages/TeamWorkspaces.tsx`
- `client/src/pages/AdminVendors.tsx`
- `client/src/pages/Subscriptions.tsx`
- `server/src/services/stripe.ts`
- `server/src/api/vendor-portal/vendor-portal.schema.ts`
- `server/src/api/vendor-portal/vendor-portal.service.ts`
- `server/src/api/vendor-portal/vendor-portal.controller.ts`
- `server/src/api/vendor-portal/vendor-portal.router.ts`
- `server/src/api/evaluations/evaluations.schema.ts`
- `server/src/api/evaluations/evaluations.service.ts`
- `server/src/api/evaluations/evaluations.controller.ts`
- `server/src/api/evaluations/evaluations.router.ts`
- `server/src/api/subscriptions/subscriptions.controller.ts`
- `server/src/api/subscriptions/subscriptions.router.ts`
- `server/src/api/admin/admin-vendors.controller.ts`
- `server/src/api/admin/admin.router.ts`
- `progress/phase-5-commercial.md` (this file)

### Modified files (6):
- `prisma/schema.prisma` — 12 new models + 5 relation additions
- `server/src/index.ts` — 4 new router mounts
- `client/src/App.tsx` — 4 new routes
- `client/src/components/layout/Sidebar.tsx` — restructured 4-section nav
- `client/src/lib/api.ts` — 25 new API methods
- `package.json` — stripe dependency added

---

## Verification Checklist

- [x] `npx prisma validate` — schema valid
- [x] `npx prisma generate` — client generated (v5.22.0)
- [x] `npx prisma db push` — tables created in PostgreSQL
- [x] `npx tsc --noEmit -p server/tsconfig.json` — 0 errors
- [x] `npx tsc --noEmit -p client/tsconfig.json` — 0 new errors (2 pre-existing in AdminSystems/SystemDetail unchanged)
- [x] Git commit: `980d777` — 24 files, 4,197 insertions

---

## Platform Summary — Phases 1–5

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Core scoring, leaderboard, heatmap, radar | ✅ Complete |
| 2 | Authentication, baskets, TCO, research, vendor showcase | ✅ Complete |
| 3 | Integration/Architecture Assessment, Value Analysis, Document Generator | ✅ Complete |
| 4 | Multi-Jurisdiction Procurement Engine (UK/EU/US/AU) | ✅ Complete |
| 5 | Vendor Portal, Stripe Subscriptions, Team Workspaces, Admin Vendors | ✅ Complete |

**Total**: 27 React pages, 20 API modules, 40+ Prisma models, 5 jurisdictions

---

## Next Priorities (Phase 6 candidates)

1. **HESA Data Futures Export** — XML generation validating against HESA XSD schema
2. **TEF/OfS Metrics Dashboard** — continuation, completion, progression rates from live data
3. **Contract Register** — post-award contract management, milestone tracking, KPI monitoring
4. **Multi-tenancy hardening** — institution data isolation, row-level security
5. **n8n Workflow Automation** — onboarding flows, evaluation reminders, subscription renewal notifications
6. **Email notifications** — vendor approval, score challenge resolved, evaluation complete
