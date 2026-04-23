import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { BarChart } from '../components/charts/BarChart';
import { Skeleton } from '../components/ui/Skeleton';
import { useFramework } from '../contexts/FrameworkContext';
import { useSystems, useSystemScores } from '../hooks/useApi';
import { formatPercent, scoreColor, scoreLabel } from '../lib/utils';
import { LicenceAttribution } from '../components/LicenceAttribution';

export function SystemDetail() {
  const { t } = useTranslation('systems');
  const { activeFramework } = useFramework();
  const { data: systems, isLoading: loadingSystems } = useSystems();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '');

  const effectiveId = selectedId || (systems?.[0]?.id ?? '');
  const { data: scoreData, isLoading: loadingScores } = useSystemScores(effectiveId, activeFramework?.id);

  const system = systems?.find(s => s.id === effectiveId);

  const domainLabels = scoreData?.byDomain.map(f => f.domainName.split(' ').slice(0, 2).join('\n')) || [];
  const domainPercentages = scoreData?.byDomain.map(f =>
    f.maxScore > 0 ? (f.score / f.maxScore) * 100 : 0
  ) || [];

  const sortedDomains = scoreData?.byDomain
    ? [...scoreData.byDomain].sort((a, b) =>
        (b.maxScore > 0 ? b.score / b.maxScore : 0) - (a.maxScore > 0 ? a.score / a.maxScore : 0)
      )
    : [];

  const topDomains = sortedDomains.slice(0, 3);
  const bottomDomains = sortedDomains.slice(-3).reverse();

  const totalPct = scoreData?.byDomain
    ? (() => {
        const totalScore = scoreData.byDomain.reduce((s, f) => s + f.score, 0);
        const maxScore = scoreData.byDomain.reduce((s, f) => s + f.maxScore, 0);
        return maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
      })()
    : 0;

  return (
    <div>
      <Header title={t('detail.title', 'System Detail')} subtitle={t('detail.subtitle', "Deep-dive into a single system's HERM capability profile")} />

      {/* System selector */}
      <Card className="mb-6">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">{t('detail.selectSystem', 'Select System')}</label>
        {loadingSystems ? (
          <div className="text-gray-400 text-sm">{t('detail.loadingSystems', 'Loading systems...')}</div>
        ) : (
          <select
            value={effectiveId}
            onChange={e => setSelectedId(e.target.value)}
            className="w-full md:w-96 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white"
          >
            {(systems || []).map(s => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.vendor} ({s.category})
              </option>
            ))}
          </select>
        )}
      </Card>

      {system && (
        <>
          {/* System header */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
            <Card className="lg:col-span-3">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{system.name}</h2>
                    <Badge text={system.category} category={system.category} />
                    {system.isOwnSystem && (
                      <span className="text-xs bg-teal text-white px-2 py-0.5 rounded font-semibold">{t('detail.yourSystem', 'YOUR SYSTEM')}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{system.description}</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span><span className="text-gray-400">{t('detail.vendor', 'Vendor')}:</span> <strong>{system.vendor}</strong></span>
                    <span><span className="text-gray-400">{t('detail.cloud', 'Cloud')}:</span> <strong>{system.cloudNative ? t('detail.cloudNative', 'Native') : t('detail.cloudOnPremise', 'On-Premise')}</strong></span>
                    <span><span className="text-gray-400">{t('detail.regions', 'Regions')}:</span> <strong>{system.regions.join(', ')}</strong></span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="flex flex-col items-center justify-center text-center">
              <div
                className="text-5xl font-bold mb-1"
                style={{ color: totalPct >= 70 ? '#16a34a' : totalPct >= 40 ? '#d97706' : '#dc2626' }}
              >
                {loadingScores ? '...' : formatPercent(totalPct)}
              </div>
              <div className="text-sm text-gray-500">{t('detail.hermCoverage', 'HERM Coverage')}</div>
              <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${totalPct}%`,
                    backgroundColor: totalPct >= 70 ? '#16a34a' : totalPct >= 40 ? '#d97706' : '#dc2626',
                    transition: 'width 500ms ease-out',
                  }}
                />
              </div>
            </Card>
          </div>

          {/* Family Bar Chart */}
          <Card className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{t('detail.coverageByFamily', 'Coverage by Family')}</h3>
            {loadingScores ? (
              <div className="space-y-3 py-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              <BarChart labels={domainLabels} data={domainPercentages} />
            )}
          </Card>

          {/* Strengths & Weaknesses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card>
              <h3 className="text-sm font-semibold text-green-600 mb-3">{t('detail.topStrengths', 'Top Strengths')}</h3>
              <div className="space-y-2">
                {topDomains.map(f => {
                  const pct = f.maxScore > 0 ? (f.score / f.maxScore) * 100 : 0;
                  return (
                    <div key={f.domainCode}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 dark:text-gray-300">{f.domainName}</span>
                        <span className="font-semibold text-green-600">{formatPercent(pct)}</span>
                      </div>
                      <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${pct}%`, transition: 'width 500ms ease-out' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-red-500 mb-3">{t('detail.capabilityGaps', 'Capability Gaps')}</h3>
              <div className="space-y-2">
                {bottomDomains.map(f => {
                  const pct = f.maxScore > 0 ? (f.score / f.maxScore) * 100 : 0;
                  return (
                    <div key={f.domainCode}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 dark:text-gray-300">{f.domainName}</span>
                        <span className="font-semibold text-red-500">{formatPercent(pct)}</span>
                      </div>
                      <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${pct}%`, transition: 'width 500ms ease-out' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Detailed score table */}
          {!loadingScores && scoreData && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{t('detail.allScoresByFamily', 'All Scores by Family')}</h3>
              <div className="space-y-6">
                {scoreData.byDomain.map(domain => (
                  <div key={domain.domainCode}>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm font-semibold text-gray-800 dark:text-white">{domain.domainName}</h4>
                      <span className="text-xs text-gray-500">
                        {domain.score}/{domain.maxScore} ({domain.maxScore > 0 ? Math.round((domain.score / domain.maxScore) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {domain.capabilities.map(cap => (
                        <div
                          key={cap.code}
                          className="flex items-center gap-2 text-xs p-2 rounded-lg border border-gray-100 dark:border-gray-700"
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: scoreColor(cap.value) }}
                          />
                          <span className="text-gray-500 font-mono">{cap.code}</span>
                          <span className="text-gray-700 dark:text-gray-300 truncate" title={cap.name}>{cap.name}</span>
                          <span className="ml-auto font-semibold" style={{ color: scoreColor(cap.value) }}>
                            {scoreLabel(cap.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <LicenceAttribution />
    </div>
  );
}
