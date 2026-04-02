import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSystems } from '../hooks/useApi';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { SearchInput } from '../components/ui/SearchInput';
import { useDebounce } from '../hooks/useDebounce';
import { CATEGORY_COLORS } from '../lib/constants';
import { Cloud, Server, Globe, ChevronRight } from 'lucide-react';
import type { VendorSystem } from '../types';

const CATEGORIES = ['All', 'SIS', 'LMS', 'CRM', 'HCM', 'SJMS'];
const DEPLOYMENTS = ['All', 'Cloud', 'On-Premise'];

export function VendorShowcase() {
  const { data: systems, isLoading } = useSystems();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [deployment, setDeployment] = useState('All');
  const debouncedSearch = useDebounce(search);
  const navigate = useNavigate();

  const filtered = (systems ?? []).filter(s => {
    const matchSearch = !debouncedSearch || s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) || s.vendor.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchCat = category === 'All' || s.category === category;
    const matchDeploy = deployment === 'All' || (deployment === 'Cloud' && s.cloudNative) || (deployment === 'On-Premise' && !s.cloudNative);
    return matchSearch && matchCat && matchDeploy;
  });

  return (
    <div>
      <Header title="Vendor Showcase" subtitle="Explore all 21 systems with detailed profiles, technical specs, and commercial intelligence" />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="w-64">
          <SearchInput value={search} onChange={setSearch} placeholder="Search vendors..." />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={deployment} onChange={e => setDeployment(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
          {DEPLOYMENTS.map(d => <option key={d}>{d}</option>)}
        </select>
        <span className="text-sm text-gray-500 dark:text-gray-400 self-center">{filtered.length} systems</span>
      </div>

      {isLoading && <div className="text-gray-400 text-center py-12">Loading systems...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(system => (
          <SystemCard key={system.id} system={system} onClick={() => navigate(`/vendor/${system.id}`)} />
        ))}
      </div>
    </div>
  );
}

function SystemCard({ system, onClick }: { system: VendorSystem; onClick: () => void }) {
  const color = CATEGORY_COLORS[system.category] || '#6b7280';
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow group">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge text={system.category} category={system.category} />
            {system.isOwnSystem && <Badge text="★ YOUR SYSTEM" className="bg-teal-100 text-teal-800" />}
          </div>
          <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-base leading-tight">{system.name}</h3>
          <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{system.vendor}</p>
        </div>
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '20' }}>
          <span className="text-xs font-bold" style={{ color }}>{system.category}</span>
        </div>
      </div>

      <p className="text-gray-600 dark:text-gray-300 text-xs line-clamp-2 mb-3">{system.description}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {system.cloudNative ? <><Cloud className="w-3 h-3 text-blue-500" /> Cloud-native</> : <><Server className="w-3 h-3 text-orange-500" /> On-premise</>}
          <span>·</span>
          <Globe className="w-3 h-3" />
          <span>{system.regions.slice(0, 2).join(', ')}{system.regions.length > 2 ? '...' : ''}</span>
        </div>
        <button onClick={onClick} className="flex items-center gap-1 text-xs text-teal font-medium group-hover:gap-2 transition-all">
          View Profile <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </Card>
  );
}
