import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { BarChart } from '../components/charts/BarChart';
import { LicenceAttribution } from '../components/LicenceAttribution';
import { useDomains, useCapabilities, useCapability } from '../hooks/useApi';
import { useFramework } from '../contexts/FrameworkContext';
import { CATEGORY_COLORS } from '../lib/constants';

export function CapabilityView() {
  const { t } = useTranslation('capabilities');
  const { activeFramework } = useFramework();
  const { data: domains } = useDomains();
  const { data: capabilities } = useCapabilities();
  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedCode, setSelectedCode] = useState('');

  const filteredCaps = selectedDomain
    ? (capabilities || []).filter(c => c.domain?.code === selectedDomain)
    : (capabilities || []);

  const { data: capDetail, isLoading } = useCapability(selectedCode);

  const systemLabels = capDetail?.scores?.map((s: { system: { name: string } }) => s.system.name) || [];
  const systemValues = capDetail?.scores?.map((s: { value: number }) => s.value) || [];
  const systemColors = capDetail?.scores?.map((s: { system: { category: string } }) =>
    CATEGORY_COLORS[s.system.category] || '#6b7280'
  ) || [];

  return (
    <div>
      <Header
        title={t('view.title', 'Capability View')}
        subtitle={t('view.subtitle', `See which systems support any ${activeFramework?.name ?? 'framework'} capability`)}
      />

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">{t('view.family', 'Family')}</label>
            <select
              value={selectedDomain}
              onChange={e => { setSelectedDomain(e.target.value); setSelectedCode(''); }}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white"
            >
              <option value="">{t('view.allFamilies', 'All Families')}</option>
              {(domains || []).map(f => (
                <option key={f.code} value={f.code}>{f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">{t('view.capability', 'Capability')}</label>
            <select
              value={selectedCode}
              onChange={e => setSelectedCode(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white"
            >
              <option value="">{t('view.selectCapability', 'Select a capability...')}</option>
              {filteredCaps.map(c => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {selectedCode && (
        <>
          {isLoading ? (
            <Card><div className="text-center py-10 text-gray-400">{t('view.loading', 'Loading capability data...')}</div></Card>
          ) : capDetail ? (
            <>
              <Card className="mb-6">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-sm text-teal font-semibold">{capDetail.code}</span>
                      <span className="text-xs text-gray-400">{capDetail.domain?.name}</span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{capDetail.name}</h2>
                    {capDetail.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{capDetail.description}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {capDetail.scores?.filter((s: { value: number }) => s.value === 100).length || 0}
                    </div>
                    <div className="text-xs text-gray-400">{t('view.fullSupport', 'Full support')}</div>
                    <div className="text-lg font-bold text-amber-500 mt-1">
                      {capDetail.scores?.filter((s: { value: number }) => s.value === 50).length || 0}
                    </div>
                    <div className="text-xs text-gray-400">{t('view.partialSupport', 'Partial support')}</div>
                  </div>
                </div>
              </Card>

              <Card>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                  {t('view.allSystemsCoverage', 'All Systems \u2014 Coverage for {{code}}', { code: capDetail.code })}
                </h3>
                <BarChart
                  labels={systemLabels}
                  data={systemValues}
                  colors={systemColors}
                  horizontal={true}
                />
              </Card>
            </>
          ) : null}
        </>
      )}

      {!selectedCode && (
        <Card>
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-2">{t('view.selectPromptTitle', 'Select a capability above')}</p>
            <p className="text-sm">{t('view.selectPromptSubtitle', "You'll see which systems cover it and to what degree")}</p>
          </div>
        </Card>
      )}

      <LicenceAttribution />
    </div>
  );
}
