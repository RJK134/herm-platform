import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { RadarChart } from '../components/charts/RadarChart';
import { useSystems, useCompare } from '../hooks/useApi';
import { CATEGORY_COLORS } from '../lib/constants';
import { formatPercent } from '../lib/utils';
import { LicenceAttribution } from '../components/LicenceAttribution';

const DEFAULT_IDS_SLUGS = ['sits', 'banner', 'workday_student', 'sjms'];

export function RadarComparison() {
  const { t } = useTranslation('capabilities');
  const { data: allSystems, isLoading: loadingSystems } = useSystems();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Once systems load, pick defaults by name matching
  const resolvedIds = selectedIds.length > 0
    ? selectedIds
    : (allSystems || [])
        .filter(s =>
          DEFAULT_IDS_SLUGS.some(slug =>
            s.name.toLowerCase().includes(slug.replace('_', ' ').split('_')[0])
              && (slug === 'sjms' ? s.isOwnSystem : true)
          )
        )
        .slice(0, 4)
        .map(s => s.id);

  const { data: comparison, isLoading: loadingCompare } = useCompare(resolvedIds);

  const toggleSystem = (id: string) => {
    setSelectedIds(prev => {
      const next = prev.length === 0
        ? [...resolvedIds]
        : prev.includes(id)
          ? prev.filter(x => x !== id)
          : prev.length < 5
            ? [...prev, id]
            : prev;
      return next;
    });
  };

  const domainLabels = comparison?.[0]?.domainScores.map(f => f.domainName.split(' ').slice(0, 2).join(' ')) || [];

  const radarDatasets = (comparison || []).map((entry, i) => {
    const colors = ['#2563eb', '#7c3aed', '#ea580c', '#01696F', '#0891b2'];
    return {
      label: entry.system.name,
      data: entry.domainScores.map(f => f.percentage),
      color: entry.system.isOwnSystem ? '#01696F' : (CATEGORY_COLORS[entry.system.category] || colors[i % colors.length]),
    };
  });

  const activeIds = selectedIds.length > 0 ? selectedIds : resolvedIds;

  return (
    <div>
      <Header
        title={t('radar.title', 'Radar Comparison')}
        subtitle={t('radar.subtitle', 'Compare up to 5 systems across all 11 HERM capability families')}
      />

      {/* System selector */}
      <Card className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          {t('radar.selectSystems', 'Select Systems (2\u20135)')}
        </h3>
        {loadingSystems ? (
          <div className="text-gray-400 text-sm">{t('radar.loadingSystems', 'Loading systems...')}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(allSystems || []).map(sys => {
              const isActive = activeIds.includes(sys.id);
              return (
                <button
                  key={sys.id}
                  onClick={() => toggleSystem(sys.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    isActive
                      ? 'border-teal bg-teal text-white'
                      : 'border-gray-300 text-gray-600 hover:border-teal hover:text-teal dark:border-gray-600 dark:text-gray-400'
                  }`}
                >
                  {sys.name}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Radar Chart */}
        <Card className="xl:col-span-2 flex items-center justify-center">
          {loadingCompare || resolvedIds.length < 2 ? (
            <div className="text-gray-400 text-sm py-20">
              {resolvedIds.length < 2 ? t('radar.selectAtLeast2', 'Select at least 2 systems') : t('radar.loading', 'Loading...')}
            </div>
          ) : (
            <div className="w-full max-w-xl mx-auto">
              <RadarChart labels={domainLabels} datasets={radarDatasets} />
            </div>
          )}
        </Card>

        {/* Score breakdown */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{t('radar.scoreBreakdown', 'Score Breakdown')}</h3>
          {loadingCompare ? (
            <div className="text-gray-400 text-sm">{t('radar.loading', 'Loading...')}</div>
          ) : (
            <div className="space-y-4">
              {(comparison || []).map(entry => (
                <div key={entry.system.id}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-800 dark:text-white truncate max-w-[140px]">
                      {entry.system.name}
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {formatPercent(entry.percentage)}
                    </span>
                  </div>
                  <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${entry.percentage}%`,
                        backgroundColor: entry.system.isOwnSystem ? '#01696F' : CATEGORY_COLORS[entry.system.category],
                      }}
                    />
                  </div>
                  <div className="mt-2 space-y-1">
                    {entry.domainScores.map(f => (
                      <div key={f.domainCode} className="flex justify-between text-xs text-gray-500">
                        <span className="truncate max-w-[120px]">{f.domainName}</span>
                        <span>{formatPercent(f.percentage)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <LicenceAttribution />
      </div>
    </div>
  );
}
