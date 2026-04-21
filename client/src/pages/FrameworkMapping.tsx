import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Lock, Search } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { SearchInput } from '../components/ui/SearchInput';
import { api } from '../lib/api';
import { useAuthContext } from '../contexts/AuthContext';

const STRENGTH_COLOURS: Record<string, string> = {
  exact: 'bg-green-100 text-green-800 border-green-200',
  strong: 'bg-blue-100 text-blue-800 border-blue-200',
  partial: 'bg-amber-100 text-amber-800 border-amber-200',
  weak: 'bg-gray-100 text-gray-700 border-gray-200',
};

export function FrameworkMapping() {
  const { user, isAuthenticated } = useAuthContext();
  const isEnterprise = user?.tier === 'enterprise' || user?.role === 'SUPER_ADMIN';

  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [strengthFilter, setStrengthFilter] = useState<string>('');

  const {
    data: mappings,
    isLoading: mappingsLoading,
    error: mappingsError,
  } = useQuery({
    queryKey: ['framework-mappings'],
    queryFn: () => api.listFrameworkMappings().then((r) => r.data.data),
    enabled: isAuthenticated && isEnterprise,
    retry: false,
  });

  const {
    data: selectedMapping,
    isLoading: mappingLoading,
  } = useQuery({
    queryKey: ['framework-mapping', selectedMappingId],
    queryFn: () =>
      selectedMappingId
        ? api.getFrameworkMapping(selectedMappingId).then((r) => r.data.data)
        : null,
    enabled: isAuthenticated && isEnterprise && !!selectedMappingId,
  });

  // Auto-select the first mapping when the list loads
  useEffect(() => {
    if (mappings && mappings.length > 0 && !selectedMappingId) {
      setSelectedMappingId(mappings[0].id);
    }
  }, [mappings, selectedMappingId]);

  // Filter items by search and strength
  const filteredItems = useMemo(() => {
    if (!selectedMapping) return [];
    const term = search.trim().toLowerCase();
    return selectedMapping.items.filter((item) => {
      if (strengthFilter && item.strength !== strengthFilter) return false;
      if (!term) return true;
      return (
        item.sourceCapability.code.toLowerCase().includes(term) ||
        item.sourceCapability.name.toLowerCase().includes(term) ||
        item.targetCapability.code.toLowerCase().includes(term) ||
        item.targetCapability.name.toLowerCase().includes(term) ||
        (item.notes ?? '').toLowerCase().includes(term)
      );
    });
  }, [selectedMapping, search, strengthFilter]);

  // Access gate — not enterprise
  if (!isAuthenticated || !isEnterprise) {
    return (
      <div>
        <Header
          title="Framework Mapping"
          subtitle="Cross-framework capability bridges for Enterprise subscribers"
        />
        <Card className="p-12 text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold mb-2">Enterprise feature</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Framework mapping compares capabilities across HERM, the FHE Capability Framework,
            and other standards. It is available on the Enterprise plan.
          </p>
          {!isAuthenticated ? (
            <Link to="/login" className="text-blue-600 hover:underline">
              Sign in to continue
            </Link>
          ) : (
            <Link to="/subscription" className="text-blue-600 hover:underline">
              Upgrade your subscription
            </Link>
          )}
        </Card>
      </div>
    );
  }

  if (mappingsError) {
    return (
      <div>
        <Header title="Framework Mapping" subtitle="Cross-framework capability bridges" />
        <Card className="p-6 bg-red-50 border border-red-200">
          <p className="text-red-800">Failed to load framework mappings. Please try again.</p>
        </Card>
      </div>
    );
  }

  if (mappingsLoading) {
    return (
      <div>
        <Header title="Framework Mapping" subtitle="Loading..." />
        <Card className="p-12 text-center text-gray-400">Loading mappings...</Card>
      </div>
    );
  }

  if (!mappings || mappings.length === 0) {
    return (
      <div>
        <Header title="Framework Mapping" subtitle="No mappings available" />
        <Card className="p-12 text-center text-gray-500">
          No framework mappings have been published yet.
        </Card>
      </div>
    );
  }

  const strengthCounts = selectedMapping
    ? selectedMapping.items.reduce<Record<string, number>>((acc, item) => {
        acc[item.strength] = (acc[item.strength] ?? 0) + 1;
        return acc;
      }, {})
    : {};

  return (
    <div>
      <Header
        title="Framework Mapping"
        subtitle="Cross-framework capability bridges between HERM, FHE, and other standards"
      />

      {/* Mapping selector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {mappings.map((m) => (
          <button
            key={m.id}
            onClick={() => setSelectedMappingId(m.id)}
            className={`text-left p-4 rounded-lg border transition-all ${
              selectedMappingId === m.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                : 'border-gray-200 bg-white dark:bg-gray-800 hover:border-gray-300'
            }`}
          >
            <div className="font-semibold text-gray-900 dark:text-white mb-1">{m.name}</div>
            <div className="text-xs text-gray-500 mb-2">
              {m.sourceFramework.name} <ArrowRight className="inline w-3 h-3" /> {m.targetFramework.name}
            </div>
            <div className="flex items-center gap-2">
              <Badge text={`${m._count.items} mappings`} className="bg-gray-100 text-gray-700" />
              <Badge text={m.mappingType} className="bg-purple-100 text-purple-700" />
            </div>
          </button>
        ))}
      </div>

      {/* Strength summary */}
      {selectedMapping && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {(['exact', 'strong', 'partial', 'weak'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStrengthFilter(strengthFilter === s ? '' : s)}
              className={`p-3 rounded-lg border text-left transition-all ${
                strengthFilter === s
                  ? 'ring-2 ring-blue-500 border-blue-300'
                  : 'border-gray-200'
              } ${STRENGTH_COLOURS[s]}`}
            >
              <div className="text-2xl font-bold">{strengthCounts[s] ?? 0}</div>
              <div className="text-xs uppercase tracking-wider">{s}</div>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="mb-4 max-w-md">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by code, name, or notes..."
        />
      </div>

      {/* Mapping items */}
      {mappingLoading ? (
        <Card className="p-12 text-center text-gray-400">Loading mapping details...</Card>
      ) : selectedMapping ? (
        <>
          <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Showing {filteredItems.length} of {selectedMapping.items.length} mappings
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
                    {selectedMapping.sourceFramework.name}
                  </th>
                  <th className="p-3 w-16"></th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
                    {selectedMapping.targetFramework.name}
                  </th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-gray-600 w-32">
                    Strength
                  </th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-gray-600 w-24">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="p-3">
                      <div className="font-mono text-xs text-gray-500">{item.sourceCapability.code}</div>
                      <div className="font-medium text-gray-900 dark:text-white">{item.sourceCapability.name}</div>
                      <div className="text-xs text-gray-500">{item.sourceCapability.domain.name}</div>
                    </td>
                    <td className="p-3 text-center text-gray-400">
                      <ArrowRight className="w-5 h-5 mx-auto" />
                    </td>
                    <td className="p-3">
                      <div className="font-mono text-xs text-gray-500">{item.targetCapability.code}</div>
                      <div className="font-medium text-gray-900 dark:text-white">{item.targetCapability.name}</div>
                      <div className="text-xs text-gray-500">{item.targetCapability.domain.name}</div>
                      {item.notes && (
                        <div className="text-xs text-gray-600 mt-1 italic">{item.notes}</div>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge
                        text={item.strength}
                        className={STRENGTH_COLOURS[item.strength] ?? 'bg-gray-100 text-gray-700'}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${item.confidence}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 w-8">{item.confidence}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredItems.length === 0 && (
              <div className="p-12 text-center text-gray-400">
                <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No mappings match your filters
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
