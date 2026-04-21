import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSystem, useSystemScores, useVendorProfile, useDomains } from '../hooks/useApi';
import { useFramework } from '../contexts/FrameworkContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { CATEGORY_COLORS } from '../lib/constants';
import { ArrowLeft, Globe, CheckCircle, XCircle, Building2, DollarSign, Cpu } from 'lucide-react';

export function VendorProfile() {
  const { t } = useTranslation('vendor');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeFramework } = useFramework();
  const { data: system, isLoading: sysLoading } = useSystem(id!);
  const { data: profile, isLoading: profLoading } = useVendorProfile(id!);
  const { data: scores } = useSystemScores(id!, activeFramework?.id);
  // Scope domains to the active framework so the strengths / weaknesses
  // aggregation lines up with the same framework the scores belong to.
  const { data: domains } = useDomains(activeFramework?.id);

  if (sysLoading || profLoading) return <div className="text-gray-400 text-center py-12">{t('profile.loading', 'Loading profile...')}</div>;
  if (!system) return <div className="text-red-500 text-center py-12">{t('profile.notFound', 'System not found')}</div>;

  const color = CATEGORY_COLORS[system.category] || '#6b7280';

  // Calculate domain scores from the scores data
  const domainScores = domains?.map(dom => {
    if (!scores || !dom.capabilities) return null;
    const domCaps = dom.capabilities ?? [];
    let total = 0; let count = 0;
    domCaps.forEach((cap: { code: string }) => {
      const byCode = (scores as { byCode?: Record<string, number> }).byCode ?? {};
      const v = byCode[cap.code] ?? 0;
      total += v; count++;
    });
    const pct = count > 0 ? Math.round(total / (count * 100) * 100) : 0;
    return { domain: dom, pct };
  }).filter(Boolean).sort((a, b) => (b?.pct ?? 0) - (a?.pct ?? 0)) ?? [];

  const strengths = domainScores.slice(0, 3);
  const weaknesses = domainScores.slice(-3).reverse();

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/vendor')} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> {t('profile.backToShowcase', 'Back to Vendor Showcase')}
      </Button>

      {/* Header */}
      <div className="rounded-xl p-6 mb-6 text-white" style={{ backgroundColor: color }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge text={system.category} className="bg-white/20 text-white border-white/30" />
              {system.isOwnSystem && <Badge text="★ YOUR SYSTEM" className="bg-white/20 text-white" />}
              {system.cloudNative ? <Badge text="Cloud-native" className="bg-white/20 text-white" /> : <Badge text="On-premise" className="bg-white/20 text-white" />}
            </div>
            <h1 className="text-3xl font-heading font-bold">{system.name}</h1>
            <p className="text-white/80 mt-1">{system.vendor}</p>
            <p className="text-white/70 text-sm mt-2 max-w-2xl">{system.description}</p>
          </div>
        </div>
        <div className="flex gap-4 mt-4 text-sm text-white/80">
          <span><Globe className="w-3 h-3 inline mr-1" />{system.regions.join(', ')}</span>
          {profile?.marketShare && <span>📊 {profile.marketShare}</span>}
          {profile?.gartnerPosition && <span>🎯 Gartner: {profile.gartnerPosition}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Profile details */}
        <div className="lg:col-span-2 space-y-6">
          {profile && (
            <>
              {/* Company Info */}
              <Card>
                <h2 className="font-heading font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> {t('profile.companyInfo', 'Company Information')}
                </h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {profile.foundedYear && <InfoRow label="Founded" value={profile.foundedYear.toString()} />}
                  {profile.headquarters && <InfoRow label="Headquarters" value={profile.headquarters} />}
                  {profile.employees && <InfoRow label="Employees" value={profile.employees} />}
                  {profile.marketShare && <InfoRow label="Market Position" value={profile.marketShare} />}
                </div>
              </Card>

              {/* Technical */}
              <Card>
                <h2 className="font-heading font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Cpu className="w-4 h-4" /> {t('profile.technicalProfile', 'Technical Profile')}
                </h2>
                <div className="space-y-3 text-sm">
                  {profile.techStack && <InfoRow label="Technology Stack" value={profile.techStack} />}
                  {profile.deploymentModel.length > 0 && (
                    <div><span className="text-gray-500 dark:text-gray-400 block mb-1">Deployment</span>
                      <div className="flex gap-2">{profile.deploymentModel.map(d => <Badge key={d} text={d} />)}</div></div>
                  )}
                  {profile.apiStandards.length > 0 && (
                    <div><span className="text-gray-500 dark:text-gray-400 block mb-1">API Standards</span>
                      <div className="flex flex-wrap gap-2">{profile.apiStandards.map(a => <Badge key={a} text={a} />)}</div></div>
                  )}
                  {profile.integrationProtocols.length > 0 && (
                    <div><span className="text-gray-500 dark:text-gray-400 block mb-1">Integration Protocols</span>
                      <div className="flex flex-wrap gap-2">{profile.integrationProtocols.map(p => <Badge key={p} text={p} />)}</div></div>
                  )}
                  {profile.certifications.length > 0 && (
                    <div><span className="text-gray-500 dark:text-gray-400 block mb-1">Certifications</span>
                      <div className="flex flex-wrap gap-2">{profile.certifications.map(c => <Badge key={c} text={c} className="bg-green-100 text-green-800" />)}</div></div>
                  )}
                </div>
              </Card>

              {/* Commercial */}
              <Card>
                <h2 className="font-heading font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> {t('profile.commercialInfo', 'Commercial Information')}
                </h2>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  {profile.pricingModel && <InfoRow label="Pricing Model" value={profile.pricingModel} />}
                  {profile.typicalCostRange && <InfoRow label="Typical Cost Range" value={profile.typicalCostRange} />}
                  {profile.implementationTime && <InfoRow label="Implementation Time" value={profile.implementationTime} />}
                </div>
              </Card>

              {/* Strengths & Limitations */}
              <div className="grid grid-cols-2 gap-6">
                <Card>
                  <h3 className="font-semibold text-green-700 dark:text-green-400 mb-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> {t('profile.keyStrengths', 'Key Strengths')}
                  </h3>
                  <ul className="space-y-2">
                    {profile.keyStrengths.map((s, i) => (
                      <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex gap-2">
                        <span className="text-green-500 mt-0.5">✓</span>{s}
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card>
                  <h3 className="font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
                    <XCircle className="w-4 h-4" /> {t('profile.knownLimitations', 'Known Limitations')}
                  </h3>
                  <ul className="space-y-2">
                    {profile.knownLimitations.map((l, i) => (
                      <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex gap-2">
                        <span className="text-red-500 mt-0.5">✗</span>{l}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>

              {profile.recentNews && (
                <Card>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    📰 Recent News & Updates
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{profile.recentNews}</p>
                </Card>
              )}
            </>
          )}

          {!profile && (
            <Card>
              <p className="text-gray-400 text-center py-8">No detailed profile available for this system yet. Run the seed to populate vendor profiles.</p>
            </Card>
          )}
        </div>

        {/* Right: HERM scores */}
        <div className="space-y-6">
          <Card>
            <h2 className="font-heading font-semibold text-gray-900 dark:text-white mb-4">{t('profile.hermCoverage', 'HERM Coverage')}</h2>
            <div className="space-y-3">
              {strengths.length > 0 && (
                <>
                  <div className="text-xs font-medium text-green-600 uppercase tracking-wider">Strengths</div>
                  {strengths.map(s => s && (
                    <div key={s.domain.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-700 dark:text-gray-300">{s.domain.name}</span>
                        <span className="font-medium">{s.pct}%</span>
                      </div>
                      <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${s.pct}%` }} />
                      </div>
                    </div>
                  ))}
                  <div className="text-xs font-medium text-red-500 uppercase tracking-wider mt-4">Gaps</div>
                  {weaknesses.map(s => s && (
                    <div key={s.domain.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-700 dark:text-gray-300">{s.domain.name}</span>
                        <span className="font-medium">{s.pct}%</span>
                      </div>
                      <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${s.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t('profile.quickActions', 'Quick Actions')}</h3>
            <div className="space-y-2">
              <Button variant="secondary" size="sm" className="w-full" onClick={() => navigate(`/system?id=${id}`)}>
                {t('profile.viewFullScore', 'View Full Score Analysis')}
              </Button>
              <Button variant="secondary" size="sm" className="w-full" onClick={() => navigate('/radar')}>
                {t('profile.addToRadar', 'Add to Radar Comparison')}
              </Button>
              <Button variant="secondary" size="sm" className="w-full" onClick={() => navigate('/basket')}>
                {t('profile.evaluateInBasket', 'Evaluate in Capability Basket')}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500 dark:text-gray-400 text-xs">{label}</span>
      <p className="text-gray-900 dark:text-white font-medium mt-0.5">{value}</p>
    </div>
  );
}
