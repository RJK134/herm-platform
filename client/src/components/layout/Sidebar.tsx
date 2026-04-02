import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3, Radar, Grid3X3, Building2, Search, ShoppingBasket,
  Download, Settings, Sun, Moon, Store, HelpCircle, BookOpen, Bot,
  LogIn, LogOut, User, Crown,
  Layers, TrendingUp, FileText, FolderKanban, Map,
  Users, CreditCard, Shield, PieChart, Key,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
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
}: {
  title: string;
  items: { to: string; icon: React.ComponentType<{ className?: string }>; label: string }[];
}) {
  return (
    <div>
      <div className="px-6 py-2 text-xs font-semibold text-white/30 uppercase tracking-wider">
        {title}
      </div>
      {items.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${
              isActive
                ? 'bg-teal/20 text-teal border-r-2 border-teal font-medium'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`
          }
        >
          <Icon className="w-4 h-4 flex-shrink-0" />
          {label}
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-64 flex-shrink-0 bg-sidebar text-white flex flex-col h-screen sticky top-0">
      {/* Branding */}
      <div className="p-5 border-b border-white/10">
        <div className="text-xs font-medium text-teal uppercase tracking-wider mb-1">
          HERM Dashboard v3.1
        </div>
        <div className="text-white font-heading font-bold text-lg leading-tight">
          {isAuthenticated ? user!.institutionName : 'HERM Platform'}
        </div>
        <div className="text-white/50 text-xs mt-1">
          UCISA HERM v3.1 · 165 Capabilities
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto space-y-2">
        <NavSection title={t('nav.analytics', 'Analytics')} items={analyticsItems} />
        <div className="mx-4 border-t border-white/10" />
        <NavSection title={t('nav.procurement', 'Procurement')} items={procurementItems} />
        <div className="mx-4 border-t border-white/10" />
        <NavSection title={t('nav.intelligence', 'Intelligence')} items={intelligenceItems} />
        <div className="mx-4 border-t border-white/10" />
        <NavSection title={t('nav.insights', 'Insights')} items={insightsItems} />
        <div className="mx-4 border-t border-white/10" />
        <NavSection title={t('nav.admin', 'Admin')} items={adminItems} />
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10 space-y-3">
        {/* User info / login */}
        {isAuthenticated ? (
          <div className="space-y-2">
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
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 text-white/60 hover:text-white text-sm w-full transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Sign in
          </button>
        )}

        {/* Notification + Language */}
        <div className="flex items-center justify-between mb-2">
          <NotificationBell />
          <LanguageSelector />
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 text-white/60 hover:text-white text-sm w-full transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === 'dark' ? t('theme.lightMode', 'Light Mode') : t('theme.darkMode', 'Dark Mode')}
        </button>

        <div className="text-white/20 text-xs">HERM v3.1 · 165 Capabilities · 21 Systems</div>
      </div>
    </aside>
  );
}
