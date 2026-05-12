import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { LicenceAttribution } from '../components/LicenceAttribution';
import { useHeatmap, useDomains } from '../hooks/useApi';
import { useFramework } from '../contexts/FrameworkContext';


function scoreToHex(value: number): string {
  if (value === 100) return '#16a34a';
  if (value === 50) return '#d97706';
  return '#f3f4f6';
}

// Phase 14.5a — WCAG 1.4.1 (Use of Color). The cell background is the
// fast-scan signal, but colour cannot be the SOLE channel. Each cell
// also carries a unicode glyph (●/◐/empty) so the matrix is legible to
// users with red-green colour-vision deficiency and to high-contrast
// monochrome printouts of board-pack screenshots. The glyph is
// aria-hidden because the cell-level aria-label already carries the
// semantic value ("SITS — STU.001 score 100, full coverage").
function scoreToGlyph(value: number): string {
  if (value === 100) return '●'; // ●  full
  if (value === 50) return '◐';  // ◐  partial
  return '';                           //    none
}

function scoreLabel(value: number): string {
  if (value === 100) return 'Full coverage';
  if (value === 50) return 'Partial coverage';
  return 'No coverage';
}

export function CapabilityHeatmap() {
  const { t } = useTranslation('capabilities');
  const { activeFramework } = useFramework();
  const { data, isLoading } = useHeatmap(activeFramework?.id);
  // Scope the domain dropdown to the same framework as the heatmap so the
  // filter options and the heatmap data match (fixes the cross-framework
  // mismatch flagged by Bugbot / Copilot).
  const { data: domains } = useDomains(activeFramework?.id);
  const [domainFilter, setDomainFilter] = useState('');
  const [hoveredCell, setHoveredCell] = useState<{ systemId: string; capCode: string } | null>(null);

  const filteredCapabilities = useMemo(() => {
    if (!data) return [];
    if (!domainFilter) return data.capabilities;
    return data.capabilities.filter(c => c.domain?.code === domainFilter);
  }, [data, domainFilter]);

  if (isLoading) {
    return (
      <div>
        <Header title={t('heatmap.title', 'Capability Heatmap')} subtitle={t('heatmap.subtitleLoading', `Full ${activeFramework?.name ?? 'capability'} coverage matrix`)} />
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
          value={domainFilter}
          onChange={e => setDomainFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white"
        >
          <option value="">{t('heatmap.allFamilies', 'All Families ({{count}} capabilities)', { count: data.capabilities.length })}</option>
          {(domains || []).map(f => (
            <option key={f.code} value={f.code}>
              {f.name} ({f._count?.capabilities || 0})
            </option>
          ))}
        </select>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-green-500 inline-flex items-center justify-center text-white text-[10px] font-bold" aria-hidden="true">●</span>
            {t('heatmap.legendFull', 'Full (100)')}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-amber-400 inline-flex items-center justify-center text-white text-[10px] font-bold" aria-hidden="true">◐</span>
            {t('heatmap.legendPartial', 'Partial (50)')}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-gray-200 inline-block" aria-hidden="true" />
            {t('heatmap.legendNone', 'None (0)')}
          </span>
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
        <div
          className="overflow-auto max-h-[70vh]"
          role="region"
          aria-label={t('heatmap.tableAriaLabel', 'Capability coverage matrix: {{systems}} systems by {{caps}} capabilities. Each cell encodes coverage as colour and glyph.', { systems: data.systems.length, caps: filteredCapabilities.length })}
        >
          <table className="text-xs border-collapse" style={{ minWidth: `${filteredCapabilities.length * 20 + 180}px` }}>
            <caption className="sr-only">
              {t('heatmap.tableCaption', 'Capability coverage matrix. Rows are systems; columns are HERM capability codes. Cell colour and glyph indicate coverage: green filled circle = full (100), amber half circle = partial (50), grey blank = none (0).')}
            </caption>
            <thead className="sticky top-0 z-10">
              <tr>
                <th scope="col" className="sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400 w-44">
                  {t('heatmap.systemColumn', 'System')}
                </th>
                {filteredCapabilities.map(cap => (
                  <th
                    key={cap.code}
                    scope="col"
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
                  <th scope="row" className="sticky left-0 bg-white dark:bg-gray-900 border-b border-r border-gray-200 dark:border-gray-700 py-1.5 px-3 font-medium text-gray-800 dark:text-gray-200 z-10 text-left">
                    <div className="truncate w-40">
                      {/*
                        UAT D-04 \u2014 the previous content was the six-character
                        literal `\u2605` written directly in the JSX text node.
                        JSX text nodes don't process backslash-u escapes (only
                        JS string literals do), so it rendered as raw "\u2605"
                        next to system names with isOwnSystem=true. Wrapping
                        the escape in a JS expression `{'\u2605'}` forces JS
                        to evaluate the escape and emit the BLACK STAR
                        codepoint (U+2605) before JSX sees it.
                      */}
                      {system.isOwnSystem && <span className="text-teal mr-1">{'\u2605'}</span>}
                      {system.name}
                    </div>
                  </th>
                  {filteredCapabilities.map(cap => {
                    const val = data.matrix[system.id]?.[cap.code] ?? 0;
                    const glyph = scoreToGlyph(val);
                    return (
                      <td
                        key={cap.code}
                        className="border-b border-gray-100 dark:border-gray-800 p-0 cursor-pointer"
                        onMouseEnter={() => setHoveredCell({ systemId: system.id, capCode: cap.code })}
                        onMouseLeave={() => setHoveredCell(null)}
                        title={`${system.name} \u2014 ${cap.code}: ${val === 100 ? t('heatmap.full', 'Full') : val === 50 ? t('heatmap.partial', 'Partial') : t('heatmap.none', 'None')}`}
                        aria-label={`${system.name} ${cap.code} ${scoreLabel(val)}`}
                      >
                        <div
                          className="w-5 h-5 flex items-center justify-center text-white text-[9px] font-bold leading-none"
                          style={{ backgroundColor: scoreToHex(val) }}
                          aria-hidden="true"
                        >
                          {glyph}
                        </div>
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
        {t('heatmap.hint', 'Hover over a cell to see details \u00b7 \u25cf Green = Full \u00b7 \u25d0 Amber = Partial \u00b7 Blank = None')}
      </div>

      <LicenceAttribution />
    </div>
  );
}
