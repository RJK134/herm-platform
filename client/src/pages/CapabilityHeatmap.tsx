import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { useHeatmap, useFamilies } from '../hooks/useApi';


function scoreToHex(value: number): string {
  if (value === 100) return '#16a34a';
  if (value === 50) return '#d97706';
  return '#f3f4f6';
}

export function CapabilityHeatmap() {
  const { t } = useTranslation('capabilities');
  const { data, isLoading } = useHeatmap();
  const { data: families } = useFamilies();
  const [familyFilter, setFamilyFilter] = useState('');
  const [hoveredCell, setHoveredCell] = useState<{ systemId: string; capCode: string } | null>(null);

  const filteredCapabilities = useMemo(() => {
    if (!data) return [];
    if (!familyFilter) return data.capabilities;
    return data.capabilities.filter(c => c.family?.code === familyFilter);
  }, [data, familyFilter]);

  if (isLoading) {
    return (
      <div>
        <Header title={t('heatmap.title', 'Capability Heatmap')} subtitle={t('heatmap.subtitleLoading', 'Full HERM capability coverage matrix')} />
        <Card>
          <div className="text-center py-20 text-gray-400">{t('heatmap.loading', 'Loading heatmap data \u2014 this may take a moment...')}</div>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const hoveredScore = hoveredCell
    ? data.matrix[hoveredCell.systemId]?.[hoveredCell.capCode] ?? 0
    : null;
  const hoveredSystem = hoveredCell ? data.systems.find(s => s.id === hoveredCell.systemId) : null;
  const hoveredCap = hoveredCell ? filteredCapabilities.find(c => c.code === hoveredCell.capCode) : null;

  return (
    <div>
      <Header
        title={t('heatmap.title', 'Capability Heatmap')}
        subtitle={t('heatmap.subtitle', '{{systems}} systems \u00d7 {{caps}} capabilities', { systems: data.systems.length, caps: filteredCapabilities.length })}
      />

      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <select
          value={familyFilter}
          onChange={e => setFamilyFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white"
        >
          <option value="">{t('heatmap.allFamilies', 'All Families ({{count}} capabilities)', { count: data.capabilities.length })}</option>
          {(families || []).map(f => (
            <option key={f.code} value={f.code}>
              {f.name} ({f._count?.capabilities || 0})
            </option>
          ))}
        </select>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> {t('heatmap.legendFull', 'Full (100)')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> {t('heatmap.legendPartial', 'Partial (50)')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 inline-block" /> {t('heatmap.legendNone', 'None (0)')}</span>
        </div>

        {hoveredCell && hoveredSystem && hoveredCap && (
          <div className="ml-auto flex items-center gap-2 text-sm bg-gray-900 text-white px-4 py-2 rounded-full shadow-lg">
            <span className="font-semibold">{hoveredSystem.name}</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-300">{hoveredCap.code}</span>
            <span className="text-gray-300 truncate max-w-[200px]">{hoveredCap.name}</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                hoveredScore === 100
                  ? 'bg-green-500/20 text-green-400'
                  : hoveredScore === 50
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {hoveredScore === 100 ? t('heatmap.full', 'Full') : hoveredScore === 50 ? t('heatmap.partial', 'Partial') : t('heatmap.none', 'None')}
            </span>
          </div>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="text-xs border-collapse" style={{ minWidth: `${filteredCapabilities.length * 20 + 180}px` }}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400 w-44">
                  {t('heatmap.systemColumn', 'System')}
                </th>
                {filteredCapabilities.map(cap => (
                  <th
                    key={cap.code}
                    className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-0 w-5"
                    title={`${cap.code}: ${cap.name}`}
                  >
                    <div
                      className="writing-mode-vertical text-gray-500 dark:text-gray-400 font-normal"
                      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)', padding: '4px 2px', fontSize: '10px', maxHeight: '80px', overflow: 'hidden' }}
                    >
                      {cap.code}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.systems.map(system => (
                <tr key={system.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                  <td className="sticky left-0 bg-white dark:bg-gray-900 border-b border-r border-gray-200 dark:border-gray-700 py-1.5 px-3 font-medium text-gray-800 dark:text-gray-200 z-10">
                    <div className="truncate w-40">
                      {system.isOwnSystem && <span className="text-teal mr-1">\u2605</span>}
                      {system.name}
                    </div>
                  </td>
                  {filteredCapabilities.map(cap => {
                    const val = data.matrix[system.id]?.[cap.code] ?? 0;
                    return (
                      <td
                        key={cap.code}
                        className="border-b border-gray-100 dark:border-gray-800 p-0 cursor-pointer"
                        onMouseEnter={() => setHoveredCell({ systemId: system.id, capCode: cap.code })}
                        onMouseLeave={() => setHoveredCell(null)}
                        title={`${system.name} \u2014 ${cap.code}: ${val === 100 ? t('heatmap.full', 'Full') : val === 50 ? t('heatmap.partial', 'Partial') : t('heatmap.none', 'None')}`}
                      >
                        <div
                          className="w-5 h-5"
                          style={{ backgroundColor: scoreToHex(val) }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-2 text-xs text-gray-400 text-right">
        {t('heatmap.hint', 'Hover over a cell to see details \u00b7 Green = Full \u00b7 Amber = Partial \u00b7 Light = None')}
      </div>
    </div>
  );
}
