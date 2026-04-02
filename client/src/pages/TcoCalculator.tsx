import { useState } from 'react';
import { Doughnut, Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
} from 'chart.js';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useSystems } from '../hooks/useApi';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement
);

const SIZE_PRESETS = [
  { label: 'Small (3k FTE)', students: 3000 },
  { label: 'Medium (12k FTE)', students: 12000 },
  { label: 'Large (25k FTE)', students: 25000 },
  { label: 'XL (50k FTE)', students: 50000 },
];

const HORIZONS = [3, 5, 7, 10];

const COST_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#ea580c',
  '#16a34a',
  '#0891b2',
  '#d97706',
];
const COST_LABELS = [
  'Licence',
  'Implementation',
  'Internal Staff',
  'Support',
  'Infrastructure',
  'Custom Dev',
];

interface TcoResult {
  annualLicence: number;
  implementationCost: number;
  annualInternalStaff: number;
  annualSupport: number;
  annualRunRate: number;
  totalTco: number;
  perStudentAnnual: number;
  perStudentTco: number;
  breakdown: {
    licence: number;
    implementation: number;
    staff: number;
    support: number;
    infrastructure: number;
    customDev: number;
  };
}

interface CompareResult {
  systemName: string;
  systemSlug: string;
  totalTco: number;
  perStudentAnnual: number;
  annualRunRate: number;
  breakdown: TcoResult['breakdown'];
}

function getSystemSlugFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
}

export function TcoCalculator() {
  const { data: systems } = useSystems();
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [selectedSystemId, setSelectedSystemId] = useState<string>('');
  const [compareSystemIds, setCompareSystemIds] = useState<string[]>([]);
  const [sizePreset, setSizePreset] = useState(1);
  const [customStudents, setCustomStudents] = useState<number | null>(null);
  const [horizon, setHorizon] = useState(5);
  const [result, setResult] = useState<TcoResult | null>(null);
  const [compareResults, setCompareResults] = useState<CompareResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const studentCount = customStudents ?? SIZE_PRESETS[sizePreset]!.students;

  const getSlugForId = (id: string): string => {
    const sys = systems?.find((s) => s.id === id);
    return sys ? getSystemSlugFromName(sys.name) : id;
  };

  const calculate = async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'single') {
        if (!selectedSystemId) {
          setError('Please select a system');
          return;
        }
        const slug = getSlugForId(selectedSystemId);
        const res = await api.calculateTco({ systemSlug: slug, studentCount, horizonYears: horizon });
        setResult(res.data.data as TcoResult);
        setCompareResults([]);
      } else {
        if (compareSystemIds.length === 0) {
          setError('Please select at least one system to compare');
          return;
        }
        const slugs = compareSystemIds.map((id) => getSlugForId(id));
        const res = await api.compareTco({ systemSlugs: slugs, studentCount, horizonYears: horizon });
        setCompareResults(res.data.data as CompareResult[]);
        setResult(null);
      }
    } catch (e) {
      setError('Calculation failed — please check your inputs');
      console.error('TCO calculation failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const breakdownData = result
    ? {
        labels: COST_LABELS,
        datasets: [
          {
            data: [
              result.breakdown.licence * horizon,
              result.breakdown.implementation,
              result.breakdown.staff * horizon,
              result.breakdown.support * horizon,
              result.breakdown.infrastructure * horizon,
              result.breakdown.customDev * horizon,
            ],
            backgroundColor: COST_COLORS,
          },
        ],
      }
    : null;

  const lineData = result
    ? {
        labels: Array.from({ length: horizon }, (_, i) => `Year ${i + 1}`),
        datasets: [
          {
            label: 'Cumulative TCO',
            data: Array.from({ length: horizon }, (_, i) => {
              let cumulative = result.implementationCost;
              for (let y = 0; y <= i; y++) {
                cumulative += result.annualRunRate * Math.pow(1.03, y);
              }
              return cumulative;
            }),
            borderColor: '#01696F',
            backgroundColor: '#01696F20',
            fill: true,
            tension: 0.3,
          },
        ],
      }
    : null;

  const compareBarData =
    compareResults.length > 0
      ? {
          labels: compareResults.map((r) =>
            r.systemName.split(' ').slice(0, 2).join(' ')
          ),
          datasets: [
            {
              label: `${horizon}-Year TCO`,
              data: compareResults.map((r) => r.totalTco),
              backgroundColor: compareResults.map(
                (_, i) => COST_COLORS[i % COST_COLORS.length] as string
              ),
            },
          ],
        }
      : null;

  return (
    <div>
      <Header
        title="TCO Calculator"
        subtitle="Model total cost of ownership across systems, institution sizes, and time horizons"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs panel */}
        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
              Configuration
            </h3>

            {/* Mode toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setMode('single')}
                className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors ${
                  mode === 'single'
                    ? 'bg-teal text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Single System
              </button>
              <button
                onClick={() => setMode('compare')}
                className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors ${
                  mode === 'compare'
                    ? 'bg-teal text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Compare
              </button>
            </div>

            {/* System selection */}
            {mode === 'single' ? (
              <div className="mb-4">
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                  System
                </label>
                <select
                  value={selectedSystemId}
                  onChange={(e) => setSelectedSystemId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="">Select a system…</option>
                  {(systems ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="mb-4">
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                  Compare Systems (select up to 6)
                </label>
                <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-2">
                  {(systems ?? []).map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={compareSystemIds.includes(s.id)}
                        onChange={(e) => {
                          if (e.target.checked && compareSystemIds.length < 6) {
                            setCompareSystemIds((prev) => [...prev, s.id]);
                          } else if (!e.target.checked) {
                            setCompareSystemIds((prev) =>
                              prev.filter((id) => id !== s.id)
                            );
                          }
                        }}
                        className="accent-teal"
                      />
                      <span className="text-gray-700 dark:text-gray-300">
                        {s.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Institution size */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                Institution Size
              </label>
              <div className="grid grid-cols-2 gap-1">
                {SIZE_PRESETS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSizePreset(i);
                      setCustomStudents(null);
                    }}
                    className={`py-1.5 text-xs rounded-lg font-medium transition-colors ${
                      sizePreset === i && !customStudents
                        ? 'bg-teal text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="mt-2">
                <label className="text-xs text-gray-400 block mb-1">
                  Custom student count
                </label>
                <input
                  type="number"
                  min={500}
                  max={100000}
                  value={customStudents ?? ''}
                  onChange={(e) =>
                    setCustomStudents(
                      e.target.value ? parseInt(e.target.value, 10) : null
                    )
                  }
                  placeholder="e.g. 18000"
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Time horizon */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                Time Horizon (years)
              </label>
              <div className="flex gap-1">
                {HORIZONS.map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizon(h)}
                    className={`flex-1 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                      horizon === h
                        ? 'bg-teal text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {h}yr
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 mb-3">{error}</p>
            )}

            <Button onClick={calculate} disabled={loading} className="w-full">
              {loading ? 'Calculating…' : 'Calculate TCO'}
            </Button>
          </Card>

          <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <strong>Disclaimer:</strong> TCO figures are indicative benchmarks
              based on typical UK HE implementations. Actual costs vary
              significantly. Always obtain formal quotes.
            </p>
          </Card>
        </div>

        {/* Results panel */}
        <div className="lg:col-span-2 space-y-4">
          {!result && compareResults.length === 0 && (
            <Card className="flex items-center justify-center min-h-64 text-gray-400">
              <div className="text-center">
                <div className="text-4xl mb-3">&#x1F4B0;</div>
                <p className="font-medium">
                  Configure your institution and click Calculate TCO
                </p>
                <p className="text-sm mt-1">
                  Benchmark data for 21 systems included
                </p>
              </div>
            </Card>
          )}

          {result && mode === 'single' && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Card className="text-center">
                  <div className="text-xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(result.totalTco)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {horizon}-Year TCO
                  </div>
                </Card>
                <Card className="text-center">
                  <div className="text-xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(result.annualRunRate)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Annual Run Rate
                  </div>
                </Card>
                <Card className="text-center">
                  <div className="text-xl font-bold text-gray-900 dark:text-white">
                    £{Math.round(result.perStudentAnnual)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Per Student / Year
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-white">
                    Cost Breakdown
                  </h3>
                  {breakdownData && (
                    <Doughnut
                      data={breakdownData}
                      options={{
                        plugins: {
                          legend: {
                            position: 'right',
                            labels: { boxWidth: 12, font: { size: 11 } },
                          },
                        },
                        cutout: '65%',
                      }}
                    />
                  )}
                </Card>
                <Card>
                  <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-white">
                    Cumulative Spend
                  </h3>
                  {lineData && (
                    <Line
                      data={lineData}
                      options={{
                        plugins: { legend: { display: false } },
                        scales: {
                          y: {
                            ticks: {
                              callback: (v) =>
                                `£${Math.round(Number(v) / 1000)}K`,
                            },
                          },
                        },
                      }}
                    />
                  )}
                </Card>
              </div>

              {/* Breakdown table */}
              <Card>
                <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-white">
                  Cost Component Detail
                </h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 text-gray-500">Component</th>
                      <th className="text-right py-2 text-gray-500">Annual</th>
                      <th className="text-right py-2 text-gray-500">
                        {horizon}-Year Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: 'Licence',
                        annual: result.breakdown.licence,
                        total: result.breakdown.licence * horizon,
                      },
                      {
                        label: 'Implementation (one-off)',
                        annual: 0,
                        total: result.breakdown.implementation,
                      },
                      {
                        label: 'Internal Staff',
                        annual: result.breakdown.staff,
                        total: result.breakdown.staff * horizon,
                      },
                      {
                        label: 'Support & Maintenance',
                        annual: result.breakdown.support,
                        total: result.breakdown.support * horizon,
                      },
                      {
                        label: 'Infrastructure',
                        annual: result.breakdown.infrastructure,
                        total: result.breakdown.infrastructure * horizon,
                      },
                      {
                        label: 'Custom Development',
                        annual: result.breakdown.customDev,
                        total: result.breakdown.customDev * horizon,
                      },
                    ].map((row) => (
                      <tr
                        key={row.label}
                        className="border-b border-gray-100 dark:border-gray-700/50"
                      >
                        <td className="py-2 text-gray-700 dark:text-gray-300">
                          {row.label}
                        </td>
                        <td className="py-2 text-right text-gray-600 dark:text-gray-400">
                          {row.annual > 0 ? formatCurrency(row.annual) : '—'}
                        </td>
                        <td className="py-2 text-right font-medium text-gray-900 dark:text-white">
                          {formatCurrency(row.total)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-300 dark:border-gray-600">
                      <td className="py-2 font-bold text-gray-900 dark:text-white">
                        Total
                      </td>
                      <td className="py-2 text-right font-bold text-gray-900 dark:text-white">
                        {formatCurrency(result.annualRunRate)}
                      </td>
                      <td className="py-2 text-right font-bold text-teal">
                        {formatCurrency(result.totalTco)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Card>
            </>
          )}

          {compareResults.length > 0 && mode === 'compare' && (
            <>
              <Card>
                <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-white">
                  {horizon}-Year TCO Comparison
                </h3>
                {compareBarData && (
                  <Bar
                    data={compareBarData}
                    options={{
                      indexAxis: 'y',
                      plugins: { legend: { display: false } },
                      scales: {
                        x: {
                          ticks: {
                            callback: (v) =>
                              `£${Math.round(Number(v) / 1000)}K`,
                          },
                        },
                      },
                    }}
                  />
                )}
              </Card>

              <Card>
                <h3 className="font-semibold text-sm mb-4 text-gray-900 dark:text-white">
                  Detailed Comparison
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-2 text-gray-500">
                          System
                        </th>
                        <th className="text-right py-2 px-2 text-gray-500">
                          Annual Run
                        </th>
                        <th className="text-right py-2 px-2 text-gray-500">
                          Per Student
                        </th>
                        <th className="text-right py-2 px-2 text-gray-500 font-bold">
                          {horizon}yr TCO
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareResults.map((r, i) => (
                        <tr
                          key={i}
                          className="border-b border-gray-100 dark:border-gray-700/50"
                        >
                          <td className="py-2 px-2 font-medium text-gray-900 dark:text-white">
                            {r.systemName}
                          </td>
                          <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-400">
                            {formatCurrency(r.annualRunRate)}
                          </td>
                          <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-400">
                            £{Math.round(r.perStudentAnnual)}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-gray-900 dark:text-white">
                            {formatCurrency(r.totalTco)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
