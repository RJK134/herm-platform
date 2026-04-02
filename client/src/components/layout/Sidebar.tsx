import { NavLink } from 'react-router-dom';
import {
  BarChart3, Radar, Grid3X3, Building2, Search, ShoppingBasket,
  Download, Settings, Sun, Moon, Store, HelpCircle, BookOpen, Bot,
  Calculator, Briefcase, Network
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

const analyticsItems = [
  { to: '/', icon: BarChart3, label: 'Leaderboard' },
  { to: '/radar', icon: Radar, label: 'Radar Comparison' },
  { to: '/heatmap', icon: Grid3X3, label: 'Capability Heatmap' },
  { to: '/system', icon: Building2, label: 'System Detail' },
  { to: '/capability', icon: Search, label: 'Capability View' },
  { to: '/basket', icon: ShoppingBasket, label: 'Capability Basket' },
  { to: '/tco', icon: Calculator, label: 'TCO Calculator' },
  { to: '/procurement', icon: Briefcase, label: 'Procurement Workflow' },
  { to: '/integration', icon: Network, label: 'Integration Assessment' },
];

const intelligenceItems = [
  { to: '/vendor', icon: Store, label: 'Vendor Showcase' },
  { to: '/how-it-works', icon: HelpCircle, label: 'How It Works' },
  { to: '/research', icon: BookOpen, label: 'Research & Evidence' },
  { to: '/assistant', icon: Bot, label: 'AI Assistant' },
];

const adminItems = [
  { to: '/admin', icon: Settings, label: 'Admin — Systems' },
  { to: '/export', icon: Download, label: 'Export & Download' },
];

function NavSection({ title, items }: { title: string; items: { to: string; icon: React.ComponentType<{ className?: string }>; label: string }[] }) {
  return (
    <div>
      <div className="px-6 py-2 text-xs font-semibold text-white/30 uppercase tracking-wider">{title}</div>
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

export function Sidebar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="w-64 flex-shrink-0 bg-sidebar text-white flex flex-col h-screen sticky top-0">
      <div className="p-5 border-b border-white/10">
        <div className="text-xs font-medium text-teal uppercase tracking-wider mb-1">HERM Dashboard v3.1</div>
        <div className="text-white font-heading font-bold text-lg leading-tight">Future Horizons Education</div>
        <div className="text-white/50 text-xs mt-1">UCISA HERM v3.1 · 165 Capabilities</div>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto space-y-2">
        <NavSection title="Analytics" items={analyticsItems} />
        <div className="mx-4 border-t border-white/10" />
        <NavSection title="Intelligence" items={intelligenceItems} />
        <div className="mx-4 border-t border-white/10" />
        <NavSection title="Admin" items={adminItems} />
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 text-white/60 hover:text-white text-sm w-full transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <div className="text-white/30 text-xs mt-3">Powered by FHE · v2.0.0</div>
      </div>
    </aside>
  );
}
