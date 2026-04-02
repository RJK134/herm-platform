# Platform Refresh — Responsive, i18n, Visual Polish
**Date:** 2026-04-02
**Commit:** 79f10fa
**Files:** 72 changed (3,688 insertions, 780 deletions)

## What Was Done

### 1. Responsive Sidebar
- **Collapsible at <1024px:** Icon-only mode with hover tooltips on nav items
- **Mobile off-canvas at <768px:** Hamburger menu button, slide-in sidebar with overlay backdrop
- **SidebarContext:** Shared state (isCollapsed, isMobileOpen) across AppShell
- **FHE branding badge:** "Future Horizons Education / Powered by FHE" below header
- **Footer links:** futurehorizonseducation.com + email

### 2. Full i18n (5 Languages × 30 Pages)
Every page component now uses `useTranslation()` with `t('key', 'fallback')`:
- **Batch A (Analytics):** Leaderboard, RadarComparison, CapabilityHeatmap, SystemDetail, CapabilityView, CapabilityBasket
- **Batch B (Intelligence):** VendorShowcase, VendorProfile, HowItWorks, ArchitectureAssessment, ResearchHub, AiAssistant, TcoCalculator, ValueAnalysis
- **Batch C (Procurement):** ProcurementProjects, ProcurementGuide, ProcurementWorkflow, TeamWorkspaces, DocumentGenerator
- **Batch D (Admin):** AdminSystems, AdminVendors, VendorPortal, Subscriptions, SectorAnalytics, ApiIntegration, ExportDownload, NotFound

**~650 new keys** across 7 namespaces × 5 languages (EN/FR/DE/ES/ZH)

### 3. Visual Polish
- Card: `hoverable` prop with hover shadow + lift
- Button: `transition-all duration-200`, active scale, disabled state
- Score bars: animated fills (`width 500ms ease-out`)
- Tabs: consistent teal active/hover states across all pages
- Skeleton loading components (Skeleton, SkeletonCard, SkeletonTable)
- Heatmap tooltip: prominent pill badge with score indicator
- Global CSS: smooth scrolling, teal focus rings, selection color, print stylesheet

### 4. Navigation & Content
- **DataTable:** `onRowClick` prop added
- **Leaderboard → SystemDetail:** clicking row navigates with `?id=` param
- **SystemDetail:** reads `useSearchParams` for deep linking
- **HowItWorks:** FAQs grouped into 4 categories; score aggregation formulas added
- **Fonts:** DM Sans, Inter, JetBrains Mono loaded via Google Fonts

## Files Created
- `client/src/components/ui/Skeleton.tsx`
- `client/src/contexts/SidebarContext.tsx`

## Files Modified (70)
- Sidebar, App, DataTable, Card, Button, index.css, accessibility.css, index.html
- 30 page components (all i18n wrapped)
- 35 JSON locale files (7 namespaces × 5 languages)

## TypeScript State
- 0 new errors
- Pre-existing: SystemDetail.tsx score/maxScore type shape (unchanged)

## Verification
- [x] TypeScript: `npx tsc --noEmit` — only pre-existing errors
- [x] Server TypeScript: clean
- [x] Git: committed as 79f10fa on master
