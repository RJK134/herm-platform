import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Star, Trophy, Cpu, TrendingUp } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { SearchInput } from '../components/ui/SearchInput';
import { DataTable } from '../components/tables/DataTable';
import { SkeletonTable } from '../components/ui/Skeleton';
import { useLeaderboard } from '../hooks/useApi';
import { formatPercent } from '../lib/utils';
import { CATEGORY_COLORS } from '../lib/constants';
import type { LeaderboardEntry } from '../types';

export function Leaderboard() {
  const { t } = useTranslation('leaderboard');
  const navigate = useNavigate();
  const { data, isLoading, error } = useLeaderboard();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const filtered = (data || []).filter(e => {
    const matchSearch =
      !search ||
      e.system.name.toLowerCase().includes(search.toLowerCase()) ||
      e.system.vendor.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !category || e.system.category === category;
    return matchSearch && matchCategory;
  });

  const avgCoverage = data && data.length > 0
    ? data.reduce((s, e) => s + e.percentage, 0) / data.length
    : 0;

  const topSystem = data?.[0];
  const sjmsEntry = data?.find(e => e.system.isOwnSystem);

  const columns: Array<import('../components/tables/DataTable').Column<LeaderboardEntry>> = [
    {
      key: 'rank',
      header: t('table.rank', 'Rank'),
      render: row => (
        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            row.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
            row.rank === 2 ? 'bg-gray-100 text-gray-600' :
            row.rank === 3 ? 'bg-orange-100 text-orange-600' :
            'bg-gray-50 text-gray-500'
          }`}>
            {row.rank}
          </span>
          {row.system.isOwnSystem && <Star className="w-3.5 h-3.5 text-teal fill-teal" />}
        </div>
      ),
      sortable: true,
      sortValue: row => row.rank,
    },
    {
      key: 'system',
      header: t('table.system', 'System'),
      render: row => (
        <div>
          <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
            {row.system.name}
            {row.system.isOwnSystem && (
              <span className="text-[10px] bg-teal text-white px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide">
                {t('yourSystem', 'YOUR SYSTEM')}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{row.system.vendor}</div>
        </div>
      ),
      sortable: true,
      sortValue: row => row.system.name,
    },
    {
      key: 'category',
      header: t('table.category', 'Category'),
      render: row => <Badge text={row.system.category} category={row.system.category} />,
      sortable: true,
      sortValue: row => row.system.category,
    },
    {
      key: 'cloud',
      header: t('table.cloud', 'Cloud'),
      render: row => (
        <span className={`text-xs font-medium ${row.system.cloudNative ? 'text-green-600' : 'text-gray-400'}`}>
          {row.system.cloudNative ? t('cloudNative', 'Native') : t('cloudOnPrem', 'On-prem')}
        </span>
      ),
    },
    {
      key: 'score',
      header: t('table.hermScore', 'HERM Score'),
      render: row => (
        <div className="flex items-center gap-3 min-w-[160px]">
          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="h-2 rounded-full"
              style={{
                width: `${row.percentage}%`,
                backgroundColor: CATEGORY_COLORS[row.system.category] || '#01696F',
                transition: 'width 500ms ease-out',
              }}
            />
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-white w-12 text-right">
            {formatPercent(row.percentage)}
          </span>
        </div>
      ),
      sortable: true,
      sortValue: row => row.percentage,
    },
    {
      key: 'points',
      header: t('table.points', 'Points'),
      render: row => (
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {row.totalScore.toLocaleString()} / {row.maxScore.toLocaleString()}
        </span>
      ),
      sortable: true,
      sortValue: row => row.totalScore,
    },
  ];

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500">{t('error', 'Failed to load leaderboard. Is the server running?')}</p>
      </div>
    );
  }

  return (
    <div>
      <Header
        title={t('title', 'HERM Capability Leaderboard')}
        subtitle={t('subtitle', 'Ranked coverage of all 165 UCISA HERM v3.1 capabilities across 21 systems')}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <Cpu className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">21</div>
              <div className="text-xs text-gray-500">{t('kpis.totalSystems', 'Total Systems')}</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">165</div>
              <div className="text-xs text-gray-500">{t('kpis.hermCapabilities', 'HERM Capabilities')}</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {isLoading ? '...' : formatPercent(avgCoverage)}
              </div>
              <div className="text-xs text-gray-500">{t('kpis.averageCoverage', 'Avg Coverage')}</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg flex items-center justify-center">
              <Trophy className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                {isLoading ? '...' : (topSystem?.system.name || '—')}
              </div>
              <div className="text-xs text-gray-500">{t('kpis.topSystem', 'Top System')}</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal/10 rounded-lg flex items-center justify-center">
              <Star className="w-5 h-5 text-teal fill-teal" />
            </div>
            <div>
              <div className="text-2xl font-bold text-teal">
                {isLoading ? '...' : (sjmsEntry ? formatPercent(sjmsEntry.percentage) : '—')}
              </div>
              <div className="text-xs text-gray-500">{t('kpis.sjmsScore', 'SJMS Score')}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <SearchInput value={search} onChange={setSearch} placeholder={t('filters.searchSystems', 'Search systems...')} />
          </div>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white"
          >
            <option value="">{t('filters.allCategories', 'All Categories')}</option>
            <option value="SIS">SIS</option>
            <option value="LMS">LMS</option>
            <option value="CRM">CRM</option>
            <option value="HCM">HCM</option>
            <option value="SJMS">SJMS</option>
          </select>
          <span className="text-sm text-gray-500">{t('systemsCount', '{{count}} systems', { count: filtered.length })}</span>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6"><SkeletonTable rows={10} /></div>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            onRowClick={(row) => navigate(`/system?id=${row.system.id}`)}
            getRowClass={row =>
              row.system.isOwnSystem ? 'bg-teal/5 dark:bg-teal/10' : ''
            }
          />
        )}
      </Card>
    </div>
  );
}
