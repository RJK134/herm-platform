import { useState } from 'react';
import { Plus, Eye, CloudLightning, Globe } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { SearchInput } from '../components/ui/SearchInput';
import { useSystems } from '../hooks/useApi';
import { useDebounce } from '../hooks/useDebounce';
import type { VendorSystem } from '../types';

export function AdminSystems() {
  const { data: systems, isLoading } = useSystems();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [viewSystem, setViewSystem] = useState<VendorSystem | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const debouncedSearch = useDebounce(search, 200);

  const filtered = (systems || []).filter(s => {
    const matchSearch =
      !debouncedSearch ||
      s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      s.vendor.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchCat = !category || s.category === category;
    return matchSearch && matchCat;
  });

  const categories = ['SIS', 'LMS', 'CRM', 'HCM', 'SJMS'];
  const counts = categories.reduce((acc, cat) => {
    acc[cat] = (systems || []).filter(s => s.category === cat).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <Header
        title="Admin — Systems"
        subtitle={`Managing ${systems?.length || 0} vendor systems in the HERM database`}
      />

      {/* Category KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {categories.map(cat => (
          <Card
            key={cat}
            className={`p-4 cursor-pointer transition-colors ${category === cat ? 'ring-2 ring-teal' : ''}`}
            onClick={() => setCategory(category === cat ? '' : cat)}
          >
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{counts[cat]}</div>
            <Badge text={cat} category={cat} className="mt-1" />
          </Card>
        ))}
      </div>

      <Card className="mb-4">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <SearchInput value={search} onChange={setSearch} placeholder="Search systems or vendors..." />
          </div>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add System
          </Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Loading systems...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {['System', 'Vendor', 'Category', 'Cloud', 'Regions', 'Own System', 'Actions'].map(h => (
                  <th key={h} className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(system => (
                <tr
                  key={system.id}
                  className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 ${
                    system.isOwnSystem ? 'bg-teal/5 dark:bg-teal/10' : ''
                  }`}
                >
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-900 dark:text-white">{system.name}</div>
                  </td>
                  <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{system.vendor}</td>
                  <td className="py-3 px-4">
                    <Badge text={system.category} category={system.category} />
                  </td>
                  <td className="py-3 px-4">
                    {system.cloudNative ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                        <CloudLightning className="w-3.5 h-3.5" /> Native
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-400 text-xs">
                        <Globe className="w-3.5 h-3.5" /> On-prem
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {system.regions.slice(0, 2).map(r => (
                        <span key={r} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">
                          {r}
                        </span>
                      ))}
                      {system.regions.length > 2 && (
                        <span className="text-xs text-gray-400">+{system.regions.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {system.isOwnSystem && (
                      <span className="text-xs bg-teal text-white px-2 py-0.5 rounded font-semibold">YES</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <Button size="sm" variant="ghost" onClick={() => setViewSystem(system)}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* View system modal */}
      <Modal
        open={!!viewSystem}
        onClose={() => setViewSystem(null)}
        title={viewSystem?.name || ''}
      >
        {viewSystem && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge text={viewSystem.category} category={viewSystem.category} />
              {viewSystem.isOwnSystem && (
                <span className="text-xs bg-teal text-white px-2 py-0.5 rounded font-semibold">YOUR SYSTEM</span>
              )}
              {viewSystem.cloudNative && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Cloud Native</span>
              )}
            </div>
            {viewSystem.description && (
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{viewSystem.description}</p>
            )}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <div>
                <div className="text-gray-400 text-xs mb-0.5">Vendor</div>
                <div className="font-medium dark:text-white">{viewSystem.vendor}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs mb-0.5">Category</div>
                <div className="font-medium dark:text-white">{viewSystem.category}</div>
              </div>
              <div className="col-span-2">
                <div className="text-gray-400 text-xs mb-0.5">Regions</div>
                <div className="font-medium dark:text-white">{viewSystem.regions.join(', ')}</div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Add system modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New System">
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
          <p>
            System creation via the API requires a POST to <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">/api/systems</code>.
          </p>
          <p>
            For Phase 1, systems are seeded via <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">prisma/seed.ts</code>. Full CRUD will be added in Phase 2.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => setShowAdd(false)}>
            Close
          </Button>
        </div>
      </Modal>
    </div>
  );
}
