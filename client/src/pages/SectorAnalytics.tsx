import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface Overview {
  institutions: number;
  evaluations: number;
  procurements: number;
  topSystems: Array<{ id: string; name: string; vendor: string; _count: { scores: number } }>;
  topCapabilities: Array<{ capabilityCode: string; _count: { capabilityCode: number } }>;
}

interface SystemStat {
  id: string;
  name: string;
  vendor: string;
  category: string;
  _count: { scores: number };
}

interface CapabilityDemand {
  code: string;
  count: number;
  name: string;
  family: string;
}

interface JurisdictionActivity {
  code: string;
  name: string;
  count: number;
}

interface TrendsData {
  evaluations: Record<string, number>;
  procurements: Record<string, number>;
  registrations: Record<string, number>;
}

function KpiCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{note}</p>}
    </div>
  );
}

function HorizontalBar({ label, value, max, sub }: { label: string; value: number; max: number; sub?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 text-xs text-gray-700 dark:text-gray-300 truncate flex-shrink-0">{label}</div>
      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-12 text-right text-xs text-gray-500 dark:text-gray-400">{value}</div>
      {sub && <div className="w-24 text-xs text-gray-400 dark:text-gray-500 truncate">{sub}</div>}
    </div>
  );
}

export function SectorAnalytics() {
  const overviewQ = useQuery<Overview>({
    queryKey: ['sector-overview'],
    queryFn: () => axios.get<{ success: boolean; data: Overview }>('/api/sector/analytics/overview').then(r => r.data.data),
  });

  const systemsQ = useQuery<SystemStat[]>({
    queryKey: ['sector-systems'],
    queryFn: () => axios.get<{ success: boolean; data: SystemStat[] }>('/api/sector/analytics/systems').then(r => r.data.data),
  });

  const capsQ = useQuery<CapabilityDemand[]>({
    queryKey: ['sector-capabilities'],
    queryFn: () => axios.get<{ success: boolean; data: CapabilityDemand[] }>('/api/sector/analytics/capabilities').then(r => r.data.data),
  });

  const jurisdQ = useQuery<JurisdictionActivity[]>({
    queryKey: ['sector-jurisdictions'],
    queryFn: () => axios.get<{ success: boolean; data: JurisdictionActivity[] }>('/api/sector/analytics/jurisdictions').then(r => r.data.data),
  });

  const trendsQ = useQuery<TrendsData>({
    queryKey: ['sector-trends'],
    queryFn: () => axios.get<{ success: boolean; data: TrendsData }>('/api/sector/analytics/trends').then(r => r.data.data),
  });

  const overview = overviewQ.data;
  const systems = systemsQ.data ?? [];
  const capabilities = capsQ.data ?? [];
  const jurisdictions = jurisdQ.data ?? [];
  const trends = trendsQ.data;

  const maxSystems = Math.max(...systems.map(s => s._count.scores), 1);
  const maxCaps = Math.max(...capabilities.map(c => c.count), 1);
  const maxJurisd = Math.max(...jurisdictions.map(j => j.count), 1);

  // Build trend months
  const trendMonths = (() => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  })();

  const topSystem = overview?.topSystems?.[0]?.name ?? '—';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sector Analytics</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Anonymised benchmarking data across all platform users. Minimum 5 institutions required for any aggregate.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active Institutions" value={overview?.institutions ?? '—'} />
        <KpiCard label="Evaluations Completed" value={overview?.evaluations ?? '—'} />
        <KpiCard label="Total Procurements" value={overview?.procurements ?? '—'} />
        <KpiCard label="Most Compared System" value={topSystem} />
      </div>

      {/* Most Compared Systems */}
      {systems.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Most Compared Systems (Top 10)</h2>
          <div className="space-y-3">
            {systems.slice(0, 10).map(s => (
              <HorizontalBar key={s.id} label={s.name} value={s._count.scores} max={maxSystems} sub={s.vendor} />
            ))}
          </div>
        </div>
      )}

      {/* Most Requested Capabilities */}
      {capabilities.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Most Requested Capabilities (Top 15)</h2>
          <div className="space-y-3">
            {capabilities.slice(0, 15).map(c => (
              <HorizontalBar key={c.code} label={c.name || c.code} value={c.count} max={maxCaps} sub={c.family} />
            ))}
          </div>
        </div>
      )}

      {/* Procurement by Jurisdiction */}
      {jurisdictions.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Procurement Activity by Jurisdiction</h2>
          <div className="space-y-3">
            {jurisdictions.map(j => (
              <HorizontalBar key={j.code} label={j.name} value={j.count} max={maxJurisd} />
            ))}
          </div>
        </div>
      )}

      {/* Trends */}
      {trends && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Platform Usage — Last 12 Months</h2>
          <div className="flex items-end gap-1 h-40">
            {trendMonths.map(month => {
              const evalCount = trends.evaluations[month] ?? 0;
              const procCount = trends.procurements[month] ?? 0;
              const total = evalCount + procCount;
              const maxVal = Math.max(...trendMonths.map(m => (trends.evaluations[m] ?? 0) + (trends.procurements[m] ?? 0)), 1);
              const pct = (total / maxVal) * 100;
              const shortMonth = month.slice(5); // "MM"
              return (
                <div key={month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-400 dark:text-gray-500">{total > 0 ? total : ''}</span>
                  <div className="w-full flex flex-col gap-0.5" style={{ height: `${Math.max(pct, 2)}%` }}>
                    <div className="flex-1 bg-teal-500 rounded-t-sm" title={`Evaluations: ${evalCount}`} />
                    {procCount > 0 && <div className="bg-blue-500 rounded-sm" style={{ height: `${(procCount / (total || 1)) * 100}%` }} title={`Procurements: ${procCount}`} />}
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500 -rotate-45 origin-top-left">{shortMonth}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-teal-500 inline-block" />Evaluations</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />Procurements</span>
          </div>
        </div>
      )}

      {/* Data note */}
      <p className="text-xs text-gray-400 dark:text-gray-500 text-center pb-4">
        Data anonymised across all platform users. Minimum 5 institutions required for any aggregate. Updated in real-time.
      </p>
    </div>
  );
}
