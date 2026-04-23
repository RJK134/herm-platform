import type { ComponentType } from 'react';
import {
  BarChart3,
  Radar,
  Grid3X3,
  Building2,
  Search,
  ShoppingBasket,
  Download,
  Settings,
  Store,
  HelpCircle,
  BookOpen,
  Bot,
  Layers,
  TrendingUp,
  FileText,
  FolderKanban,
  Map,
  Users,
  CreditCard,
  Shield,
  PieChart,
  Key,
  Calculator,
  Workflow,
  Bell,
} from 'lucide-react';
import type { PaidTier } from './branding';

/**
 * The product is organised around four top-level sections aligned to the
 * Future Horizons ASPT redesign brief:
 *
 *   1. HERM Explorer         — free-tier HERM reference data + attribution
 *   2. Procurement Workspace — authenticated tools, usage-capped on free
 *   3. Sector Intelligence   — paid-tier analytics across institutions
 *   4. Account & Billing     — subscription, API, notifications
 *
 * Each entry declares a `tier`:
 *   - 'public'       → visible to everyone, no auth needed
 *   - 'authenticated'→ requires a JWT but any tier passes
 *   - PaidTier[]     → requires a subscription tier. The UI shows a locked
 *                      badge and routes RequireTier to an upgrade card.
 *
 * The sidebar reads this file; App.tsx reads it to decide whether a route
 * needs a RequireTier wrapper. Single source of truth prevents drift
 * between navigation visibility, route gating, and the HERM_COMPLIANCE
 * route table.
 */
export type NavTier = 'public' | 'authenticated' | readonly PaidTier[];

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  tier: NavTier;
  /** Free-tier consumers see a usage-cap label; paid tiers see nothing. */
  freeUsageHint?: string;
}

export interface NavSection {
  id: 'explorer' | 'procurement' | 'sector' | 'account' | 'admin';
  titleKey: string;
  titleDefault: string;
  items: readonly NavItem[];
  /**
   * If true, the section is visible to anonymous visitors. Otherwise the
   * sidebar only shows it once the user is authenticated.
   */
  visibleAnonymous: boolean;
}

// ── HERM Explorer — free tier HERM content ──────────────────────────────────

const explorerItems: readonly NavItem[] = [
  { to: '/', label: 'Leaderboard', icon: BarChart3, tier: 'public' },
  { to: '/radar', label: 'Radar Comparison', icon: Radar, tier: 'public' },
  { to: '/heatmap', label: 'Capability Heatmap', icon: Grid3X3, tier: 'public' },
  { to: '/system', label: 'System Detail', icon: Building2, tier: 'public' },
  { to: '/capability', label: 'Capability View', icon: Search, tier: 'public' },
  { to: '/vendor', label: 'Vendor Showcase', icon: Store, tier: 'public' },
  { to: '/how-it-works', label: 'How It Works', icon: HelpCircle, tier: 'public' },
  { to: '/research', label: 'Research & Evidence', icon: BookOpen, tier: 'public' },
  { to: '/export', label: 'Reports & Export', icon: Download, tier: 'public' },
];

// ── Procurement Workspace — authenticated tools ─────────────────────────────

const procurementItems: readonly NavItem[] = [
  { to: '/projects', label: 'Procurement Projects', icon: FolderKanban, tier: 'authenticated', freeUsageHint: 'up to 3 on Free' },
  { to: '/guide', label: 'Procurement Guide', icon: Map, tier: 'public' },
  { to: '/basket', label: 'Capability Basket', icon: ShoppingBasket, tier: 'authenticated', freeUsageHint: 'up to 3 on Free' },
  { to: '/architecture', label: 'Architecture Assessment', icon: Layers, tier: 'authenticated' },
  { to: '/integration', label: 'Integration Assessment', icon: Workflow, tier: 'authenticated' },
  { to: '/value', label: 'Cost & Value Analysis', icon: TrendingUp, tier: 'authenticated' },
  { to: '/tco', label: 'TCO Calculator', icon: Calculator, tier: 'public', freeUsageHint: 'up to 10/mo on Free' },
  { to: '/documents', label: 'Documents', icon: FileText, tier: 'authenticated', freeUsageHint: 'up to 5/mo on Free' },
  { to: '/workspaces', label: 'Team Workspaces', icon: Users, tier: 'authenticated', freeUsageHint: 'up to 2 members on Free' },
  { to: '/procurement', label: 'Procurement Workflow', icon: Workflow, tier: 'authenticated' },
  { to: '/assistant', label: 'AI Assistant', icon: Bot, tier: 'authenticated' },
];

// ── Sector Intelligence — paid tier analytics ───────────────────────────────

const sectorItems: readonly NavItem[] = [
  { to: '/sector', label: 'Sector Analytics', icon: PieChart, tier: ['professional', 'enterprise'] as const },
  { to: '/framework-mapping', label: 'Framework Mapping', icon: Map, tier: ['enterprise'] as const },
];

// ── Account & Billing ───────────────────────────────────────────────────────

const accountItems: readonly NavItem[] = [
  { to: '/subscription', label: 'Subscription', icon: CreditCard, tier: 'authenticated' },
  { to: '/api-keys', label: 'API Integration', icon: Key, tier: ['enterprise'] as const },
  { to: '/vendor-portal', label: 'Vendor Portal', icon: Store, tier: 'authenticated' },
];

// ── Admin — role-gated, separate section ────────────────────────────────────

const adminItems: readonly NavItem[] = [
  { to: '/admin', label: 'Systems Management', icon: Settings, tier: 'authenticated' },
  { to: '/admin/vendors', label: 'Vendor Management', icon: Shield, tier: 'authenticated' },
];

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'explorer',
    titleKey: 'nav.explorer',
    titleDefault: 'HERM Explorer',
    items: explorerItems,
    visibleAnonymous: true,
  },
  {
    id: 'procurement',
    titleKey: 'nav.procurement',
    titleDefault: 'Procurement Workspace',
    items: procurementItems,
    visibleAnonymous: true,
  },
  {
    id: 'sector',
    titleKey: 'nav.sector',
    titleDefault: 'Sector Intelligence',
    items: sectorItems,
    visibleAnonymous: true,
  },
  {
    id: 'account',
    titleKey: 'nav.account',
    titleDefault: 'Account & Billing',
    items: accountItems,
    visibleAnonymous: false,
  },
  {
    id: 'admin',
    titleKey: 'nav.admin',
    titleDefault: 'Admin',
    items: adminItems,
    visibleAnonymous: false,
  },
];

/** Look up a nav entry by pathname. Returns `undefined` for unknown routes. */
export function findNavItem(pathname: string): NavItem | undefined {
  for (const section of NAV_SECTIONS) {
    const hit = section.items.find((i) => i.to === pathname);
    if (hit) return hit;
  }
  return undefined;
}

/** Shortcut notifications nav item (lives with account actions in the header). */
export const NOTIFICATIONS_ITEM: NavItem = {
  to: '/notifications',
  label: 'Notifications',
  icon: Bell,
  tier: 'authenticated',
};
