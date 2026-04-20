import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3, Radar, Grid3X3, Building2, Search, ShoppingBasket,
  Download, Settings, Sun, Moon, Store, HelpCircle, BookOpen, Bot,
  LogIn, LogOut, User, Crown,
  Layers, TrendingUp, FileText, FolderKanban, Map,
  Users, CreditCard, Shield, PieChart, Key,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { useSidebar } from '../../contexts/SidebarContext';
import { useFramework } from '../../contexts/FrameworkContext';
import { NotificationBell } from '../NotificationBell';
import { LanguageSelector } from '../LanguageSelector';

const analyticsItems = [
  { to: '/', icon: BarChart3, label: 'Leaderboard' },
  { to: '/radar', icon: Radar, label: 'Radar Comparison' },
  { to: '/heatmap', icon: Grid3X3, label: 'Capability Heatmap' },
  { to: '/system', icon: Building2, label: 'System Detail' },
  { to: '/capability', icon: Search, label: 'Capability View' },
  { to: '/basket', icon: ShoppingBasket, label: 'Capability Basket' },
];

const intelligenceItems = [
  { to: '/vendor', icon: Store, label: 'Vendor Showcase' },
  { to: '/how-it-works', icon: HelpCircle, label: 'How It Works' },
  { to: '/architecture', icon: Layers, label: 'Architecture Assessment' },
  { to: '/value', icon: TrendingUp, label: 'Cost & Value Analysis' },
  { to: '/research', icon: BookOpen, label: 'Research & Evidence' },
  { to: '/assistant', icon: Bot, label: 'AI Assistant' },
];

const procurementItems = [
  { to: '/projects', icon: FolderKanban, label: 'Procurement Projects' },
  { to: '/guide', icon: Map, label: 'Procurement Guide' },
  { to: '/workspaces', icon: Users, label: 'Team Workspaces' },
  { to: '/documents', icon: FileText, label: 'Documents' },
];

const insightsItems = [
  { to: '/sector', icon: PieChart, label: 'Sector Analytics' },
  { to: '/framework-mapping', icon: Map, label: 'Framework Mapping' },
];

const adminItems = [
  { to: '/admin', icon: Settings, label: 'Systems Management' },
  { to: '/admin/vendors', icon: Shield, label: 'Vendor Management' },
  { to: '/subscription', icon: CreditCard, label: 'Subscriptions' },
  { to: '/api-keys', icon: Key, label: 'API Integration' },
  { to: '/export', icon: Download, label: 'Reports & Export' },
];

function NavSection({
  title,
  items,
  isCollapsed,
  onNavClick,
}: {
  title: string;
  items: { to: string; icon: React.ComponentType<{ className?: string }>; label: string }[];
  isCollapsed: boolean;
  onNavClick?: () => void;
}) {
  return (
    <div>
      {!isCollapsed && (
        <div className="px-6 py-2 text-xs font-semibold text-white/30 uppercase tracking-wider">
          {title}
        </div>
      )}
      {items.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavClick}
          className={({ isActive }) =>
            `flex items-center gap-3 text-sm transition-colors relative group ${
              isCollapsed ? 'justify-center px-2 py-2.5' : 'px-6 py-2.5'
            } ${
              isActive
                ? 'bg-teal/20 text-teal border-r-2 border-teal font-medium'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`
          }
        >
          <Icon className="w-4 h-4 flex-shrink-0" />
          {!isCollapsed && label}
          {isCollapsed && (
            <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
              {label}
            </span>
          )}
        </NavLink>
      ))}
    </div>
  );
}

const TIER_COLOURS: Record<string, string> = {
  enterprise: 'bg-amber-500/20 text-amber-300',
  professional: 'bg-teal/20 text-teal',
  free: 'bg-white/10 text-white/50',
};

export function Sidebar() {
  const { theme, toggleTheme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isCollapsed, isMobileOpen, toggleCollapse, closeMobile } = useSidebar();
  const { frameworks, activeFramework, setActiveFramework } = useFramework();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    // Close mobile sidebar when a link is clicked
    closeMobile();
  };

  return (
    <>
      {/* Mobile backdrop overlay */}
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
              <div className="text-white/50 text-xs mt-1">
                {activeFramework
                  ? `${activeFramework.name} · ${activeFramework.capabilityCount} Capabilities`
                  : 'Loading...'}
              </div>
              {frameworks.length > 1 && (
                <select
                  value={activeFramework?.id ?? ''}
                  onChange={e => {
                    const fw = frameworks.find(f => f.id === e.target.value);
                    if (fw) setActiveFramework(fw);
                  }}
                  className="mt-2 w-full px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white/80"
                >
                  {frameworks.map(fw => (
                    <option key={fw.id} value={fw.id} className="text-gray-900">
                      {fw.name}
                    </option>
                  ))}
                </select>
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
              <div className="text-xs font-semibold text-teal">Future Horizons Education</div>
              <div className="text-[10px] text-white/50">Powered by FHE</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto space-y-2">
          <NavSection title={t('nav.analytics', 'Analytics')} items={analyticsItems} isCollapsed={isCollapsed} onNavClick={handleNavClick} />
          <div className="mx-4 border-t border-white/10" />
          <NavSection title={t('nav.procurement', 'Procurement')} items={procurementItems} isCollapsed={isCollapsed} onNavClick={handleNavClick} />
          <div className="mx-4 border-t border-white/10" />
          <NavSection title={t('nav.intelligence', 'Intelligence')} items={intelligenceItems} isCollapsed={isCollapsed} onNavClick={handleNavClick} />
          <div className="mx-4 border-t border-white/10" />
          <NavSection title={t('nav.insights', 'Insights')} items={insightsItems} isCollapsed={isCollapsed} onNavClick={handleNavClick} />
          <div className="mx-4 border-t border-white/10" />
          <NavSection title={t('nav.admin', 'Admin')} items={adminItems} isCollapsed={isCollapsed} onNavClick={handleNavClick} />
        </nav>

        {/* Footer */}
        <div className={`border-t border-white/10 space-y-3 ${isCollapsed ? 'p-2' : 'p-4'}`}>
          {/* User info / login */}
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
              onClick={() => { navigate('/login'); closeMobile(); }}
              className={`flex items-center gap-2 text-white/60 hover:text-white text-sm w-full transition-colors ${isCollapsed ? 'justify-center' : ''}`}
            >
              <LogIn className="w-4 h-4" />
              {!isCollapsed && 'Sign in'}
            </button>
          )}

          {/* Notification + Language */}
          {!isCollapsed && (
            <div className="flex items-center justify-between mb-2">
              <NotificationBell />
              <LanguageSelector />
            </div>
          )}

          {/* Theme toggle */}
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
                <a href="https://futurehorizonseducation.com" target="_blank" rel="noopener" className="text-teal/60 hover:text-teal transition-colors block">futurehorizonseducation.com</a>
                <span>info@futurehorizonseducation.com</span>
              </div>
            </>
          )}

          {/* Collapse toggle button */}
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
