import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Sun,
  Moon,
  LogIn,
  LogOut,
  User,
  Crown,
  Lock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { useSidebar } from '../../contexts/SidebarContext';
import { useFramework } from '../../contexts/FrameworkContext';
import { NotificationBell } from '../NotificationBell';
import { LanguageSelector } from '../LanguageSelector';
import { NAV_SECTIONS } from '../../lib/navigation';
import type { NavItem, NavSection as NavSectionType } from '../../lib/navigation';
import { isPaidTier, PRODUCT } from '../../lib/branding';

const TIER_COLOURS: Record<string, string> = {
  enterprise: 'bg-amber-500/20 text-amber-300',
  pro: 'bg-teal/20 text-teal',
  free: 'bg-white/10 text-white/50',
};

const TIER_LABELS: Record<string, string> = {
  pro: 'Pro',
  enterprise: 'Enterprise',
};

/**
 * Builds a tooltip string that names the specific tier(s) required to
 * reach a locked item — avoids the misleading "requires a paid
 * subscription" phrasing for professional users hitting an
 * Enterprise-only route.
 */
function describeRequirement(item: NavItem): string {
  if (item.tier === 'public' || item.tier === 'authenticated') return item.label;
  const names = (item.tier as readonly string[]).map((t) => TIER_LABELS[t] ?? t);
  const joined =
    names.length <= 1
      ? names[0] ?? 'paid'
      : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
  return `${item.label} — requires ${joined}`;
}

/**
 * Computes the visual state of a nav item for the current user:
 *   - 'available'  → user passes the tier gate (or it's public)
 *   - 'locked'     → user is on a lower tier; show a lock icon
 *   - 'hidden'     → section is authed-only and user is anonymous
 */
function itemState(
  item: NavItem,
  isAuthenticated: boolean,
  userTier: string,
  userRole: string,
): 'available' | 'locked' | 'hidden' {
  if (item.tier === 'public') return 'available';
  if (item.tier === 'authenticated') return isAuthenticated ? 'available' : 'hidden';
  // Paid tier list
  if (userRole === 'SUPER_ADMIN') return 'available';
  if (!isAuthenticated) return 'locked';
  // Normalise casing on both sides — RequireTier lower-cases its inputs, so
  // the Sidebar must too, otherwise an oddly-cased JWT tier claim would
  // show as locked here while RequireTier would let it through at the
  // route level. `isPaidTier` is already case-insensitive.
  const tier = userTier.toLowerCase();
  if (!isPaidTier(tier)) return 'locked';
  const required = (item.tier as readonly string[]).map((t) => t.toLowerCase());
  return required.includes(tier) ? 'available' : 'locked';
}

/**
 * Does this section have anything to show for the current user? Kept
 * outside `NavSection` so the parent can skip rendering both the
 * section and its trailing divider — otherwise a hidden section leaves
 * a stray `<hr>` in the sidebar for anonymous visitors.
 *
 * Sections may declare `requiredRoles`. If set, only users whose role
 * matches (or SUPER_ADMIN) see the section at all — this is what makes
 * Admin's nav items invisible to regular VIEWERs. The matching routes
 * are independently protected by `<ProtectedRoute roles={…}>` in
 * App.tsx; this filter is purely cosmetic UI hide-only.
 */
function visibleItemsFor(
  section: NavSectionType,
  isAuthenticated: boolean,
  userTier: string,
  userRole: string,
): readonly NavItem[] {
  if (!section.visibleAnonymous && !isAuthenticated) return [];
  if (section.requiredRoles && section.requiredRoles.length > 0) {
    const allowed = userRole === 'SUPER_ADMIN' || section.requiredRoles.includes(userRole);
    if (!allowed) return [];
  }
  return section.items.filter(
    (i) => itemState(i, isAuthenticated, userTier, userRole) !== 'hidden',
  );
}

interface SectionProps {
  section: NavSectionType;
  isCollapsed: boolean;
  isAuthenticated: boolean;
  userTier: string;
  userRole: string;
  onNavClick?: () => void;
}

function NavSection({
  section,
  isCollapsed,
  isAuthenticated,
  userTier,
  userRole,
  onNavClick,
}: SectionProps) {
  const { t } = useTranslation();
  // Parent is responsible for skipping hidden sections (so dividers
  // don't orphan). Defensive re-check for direct consumers.
  const visibleItems = visibleItemsFor(section, isAuthenticated, userTier, userRole);
  if (visibleItems.length === 0) return null;

  return (
    <div>
      {!isCollapsed && (
        <div className="px-6 py-2 text-xs font-semibold text-white/30 uppercase tracking-wider">
          {t(section.titleKey, section.titleDefault)}
        </div>
      )}
      {visibleItems.map((item) => {
        const state = itemState(item, isAuthenticated, userTier, userRole);
        const locked = state === 'locked';
        const Icon = item.icon;
        const lockedTooltip = locked ? describeRequirement(item) : null;

        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={(event) => {
              if (locked) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              onNavClick?.();
            }}
            aria-disabled={locked || undefined}
            tabIndex={locked ? -1 : undefined}
            title={
              lockedTooltip ??
              (item.freeUsageHint && !isPaidTier(userTier)
                ? `${item.label} (${item.freeUsageHint})`
                : item.label)
            }
            className={({ isActive }) =>
              `flex items-center gap-3 text-sm transition-colors relative group ${
                isCollapsed ? 'justify-center px-2 py-2.5' : 'px-6 py-2.5'
              } ${
                isActive
                  ? 'bg-teal/20 text-teal border-r-2 border-teal font-medium'
                  : locked
                    ? 'text-white/30 hover:text-white/50'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {!isCollapsed && (
              <>
                <span className="flex-1 truncate">{item.label}</span>
                {locked && (
                  <Lock
                    className="w-3 h-3 text-amber-300/60 flex-shrink-0"
                    aria-label="Requires upgrade"
                  />
                )}
              </>
            )}
            {isCollapsed && (
              <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                {lockedTooltip ?? item.label}
              </span>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const { theme, toggleTheme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isCollapsed, isMobileOpen, toggleCollapse, closeMobile } = useSidebar();
  const { frameworks, activeFramework, setActiveFramework } = useFramework();

  const userTier = user?.tier ?? '';
  const userRole = user?.role ?? '';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = () => closeMobile();

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeMobile}
        />
      )}

      <aside
        className={`
          flex-shrink-0 bg-sidebar text-white flex flex-col h-screen z-50
          transition-all duration-300 ease-in-out
          ${isCollapsed ? 'w-16' : 'w-64'}
          fixed md:sticky top-0
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Branding */}
        <div className={`border-b border-white/10 ${isCollapsed ? 'p-2' : 'p-5'}`}>
          {isCollapsed ? (
            <div className="flex items-center justify-center">
              <div className="w-8 h-8 rounded-lg bg-teal/20 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-teal" />
              </div>
            </div>
          ) : (
            <>
              <div className="text-xs font-medium text-teal uppercase tracking-wider mb-1">
                {activeFramework?.name ?? 'Capability Platform'}
              </div>
              <div className="text-white font-heading font-bold text-lg leading-tight">
                {isAuthenticated ? user!.institutionName : (activeFramework?.name ?? 'Capability Platform')}
              </div>
              {/*
                Phase 14.4 — promote the framework switcher from a bare
                <select> in the sidebar branding area to a labelled
                "Active framework" context card. UAT D-08 flagged it as
                "hidden in a tiny dropdown despite gating all explorer
                data". The card now owns its own region with a clear
                label, the active framework name, the capability +
                domain counts, and (when more than one framework is
                visible to the tier) a more prominent picker. Still
                lives in the sidebar rather than a brand-new top bar
                because adding a top bar is a bigger layout overhaul
                tracked separately.
              */}
              {activeFramework && (
                <div className="mt-3 p-2.5 bg-white/5 border border-white/10 rounded-lg">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-teal mb-1">
                    Active Framework
                  </div>
                  {frameworks.length > 1 ? (
                    <select
                      value={activeFramework.id}
                      onChange={(e) => {
                        const fw = frameworks.find((f) => f.id === e.target.value);
                        if (fw) setActiveFramework(fw);
                      }}
                      aria-label="Switch active capability framework"
                      className="w-full px-2 py-1.5 text-sm bg-white/10 border border-white/20 rounded text-white cursor-pointer hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-teal/40"
                    >
                      {frameworks.map((fw) => (
                        <option key={fw.id} value={fw.id} className="text-gray-900">
                          {fw.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm font-medium text-white">
                      {activeFramework.name}
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-white/50">
                    {activeFramework.capabilityCount} capabilities · {activeFramework.domainCount} domains
                  </div>
                </div>
              )}
              {!activeFramework && (
                <div className="text-white/50 text-xs mt-1">Loading…</div>
              )}
            </>
          )}
        </div>

        {/* FHE Branding Badge */}
        <div className={`mx-3 my-2 ${isCollapsed ? 'px-1 py-2' : 'px-3 py-2'} bg-teal/10 border border-teal/20 rounded-lg flex items-center gap-2 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-7 h-7 rounded-md bg-teal/20 flex items-center justify-center flex-shrink-0">
            <span className="text-teal text-xs font-bold">FH</span>
          </div>
          {!isCollapsed && (
            <div>
              <div className="text-xs font-semibold text-teal">{PRODUCT.name}</div>
              <div className="text-[10px] text-white/50">by {PRODUCT.vendor}</div>
            </div>
          )}
        </div>

        {/* Navigation — driven from lib/navigation.ts for single-source-of-truth IA */}
        <nav className="flex-1 py-3 overflow-y-auto space-y-2">
          {NAV_SECTIONS
            .filter((s) => visibleItemsFor(s, isAuthenticated, userTier, userRole).length > 0)
            .map((section, idx, arr) => (
              <div key={section.id}>
                <NavSection
                  section={section}
                  isCollapsed={isCollapsed}
                  isAuthenticated={isAuthenticated}
                  userTier={userTier}
                  userRole={userRole}
                  onNavClick={handleNavClick}
                />
                {idx < arr.length - 1 && <div className="mx-4 border-t border-white/10 my-2" />}
              </div>
            ))}
        </nav>

        {/* Footer */}
        <div className={`border-t border-white/10 space-y-3 ${isCollapsed ? 'p-2' : 'p-4'}`}>
          {isAuthenticated ? (
            <div className="space-y-2">
              {!isCollapsed ? (
                <>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-teal/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-3.5 h-3.5 text-teal" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-white text-xs font-medium truncate">{user!.name}</div>
                      <div className="text-white/40 text-xs truncate">{user!.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        TIER_COLOURS[user!.tier] ?? TIER_COLOURS.free
                      }`}
                    >
                      <Crown className="w-3 h-3" />
                      {user!.tier.charAt(0).toUpperCase() + user!.tier.slice(1)}
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 text-white/50 hover:text-white text-xs w-full transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-teal/20 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-teal" />
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-white/50 hover:text-white transition-colors"
                    title="Sign out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => {
                navigate('/login');
                closeMobile();
              }}
              className={`flex items-center gap-2 text-white/60 hover:text-white text-sm w-full transition-colors ${isCollapsed ? 'justify-center' : ''}`}
            >
              <LogIn className="w-4 h-4" />
              {!isCollapsed && 'Sign in'}
            </button>
          )}

          {!isCollapsed && (
            <div className="flex items-center justify-between mb-2">
              <NotificationBell />
              <LanguageSelector />
            </div>
          )}

          <button
            onClick={toggleTheme}
            className={`flex items-center gap-2 text-white/60 hover:text-white text-sm w-full transition-colors ${isCollapsed ? 'justify-center' : ''}`}
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {!isCollapsed && (theme === 'dark' ? t('theme.lightMode', 'Light Mode') : t('theme.darkMode', 'Dark Mode'))}
          </button>

          {!isCollapsed && (
            <>
              <div className="text-white/20 text-xs">
                {activeFramework
                  ? `${activeFramework.name} · ${activeFramework.capabilityCount} Capabilities`
                  : 'Capability Platform'}
              </div>
              <div className="text-white/20 text-[10px] mt-2 space-y-0.5">
                <a
                  href="https://futurehorizonseducation.com"
                  target="_blank"
                  rel="noopener"
                  className="text-teal/60 hover:text-teal transition-colors block"
                >
                  futurehorizonseducation.com
                </a>
                <span>info@futurehorizonseducation.com</span>
              </div>
            </>
          )}

          <button
            onClick={toggleCollapse}
            className="hidden md:flex items-center justify-center w-full py-1.5 text-white/40 hover:text-white hover:bg-white/5 rounded transition-colors"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>
    </>
  );
}
