import { Download, FileText, Table2, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LicenceAttribution } from '../components/LicenceAttribution';

export function ExportDownload() {
  const { t } = useTranslation('admin');

  const exports = [
    {
      title: t('export.leaderboardCsv', 'Leaderboard CSV'),
      description: t('export.leaderboardCsvDesc', 'Ranked list of all 21 systems with HERM scores, vendor info, and coverage percentages.'),
      icon: BarChart3,
      color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20',
      href: '/api/export/leaderboard.csv',
      filename: 'herm-leaderboard.csv',
      badge: 'CSV',
    },
    {
      title: t('export.heatmapCsv', 'Capability Heatmap CSV'),
      description: t('export.heatmapCsvDesc', 'Full matrix of all 21 systems × 165 capabilities with raw scores (0, 50, 100).'),
      icon: Table2,
      color: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20',
      href: '/api/export/heatmap.csv',
      filename: 'herm-heatmap.csv',
      badge: 'CSV',
    },
    {
      title: t('export.fullReportJson', 'Full Report JSON'),
      description: t('export.fullReportJsonDesc', 'Complete JSON export including leaderboard, heatmap, system metadata, and capability definitions.'),
      icon: FileText,
      color: 'bg-green-50 text-green-600 dark:bg-green-900/20',
      href: '/api/export/report.json',
      filename: 'herm-report.json',
      badge: 'JSON',
    },
  ];

  return (
    <div>
      <Header
        title={t('export.title', 'Export & Download')}
        subtitle={t('export.subtitle', 'Download HERM capability data in multiple formats for offline analysis')}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {exports.map(exp => (
          <Card key={exp.title} className="flex flex-col">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${exp.color}`}>
              <exp.icon className="w-6 h-6" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">{exp.title}</h3>
              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded font-mono">
                {exp.badge}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex-1 mb-4">{exp.description}</p>
            <a href={exp.href} download={exp.filename}>
              <Button className="w-full">
                <Download className="w-4 h-4 mr-2" />
                {t('export.download', 'Download')} {exp.badge}
              </Button>
            </a>
          </Card>
        ))}
      </div>

      <Card>
        <h3 className="font-semibold text-gray-800 dark:text-white mb-4">{t('export.apiEndpoints', 'API Endpoints')}</h3>
        <div className="space-y-3">
          {[
            { method: 'GET', path: '/api/scores/leaderboard', desc: 'Ranked systems with family breakdowns' },
            { method: 'GET', path: '/api/scores/heatmap', desc: 'Full capability matrix' },
            { method: 'GET', path: '/api/systems', desc: 'List all 21 systems' },
            { method: 'GET', path: '/api/systems/:id/scores', desc: 'Scores for a specific system' },
            { method: 'GET', path: '/api/systems/compare?ids=x,y,z', desc: 'Compare multiple systems' },
            { method: 'GET', path: '/api/capabilities/families', desc: 'All 11 HERM families' },
            { method: 'GET', path: '/api/capabilities/:code', desc: 'Single capability with all scores' },
            { method: 'POST', path: '/api/baskets', desc: 'Create a capability basket' },
            { method: 'GET', path: '/api/baskets/:id/evaluate', desc: 'Score systems against a basket' },
            { method: 'GET', path: '/api/export/leaderboard.csv', desc: 'Leaderboard as CSV file' },
            { method: 'GET', path: '/api/export/heatmap.csv', desc: 'Heatmap matrix as CSV file' },
            { method: 'GET', path: '/api/export/report.json', desc: 'Full report as JSON' },
          ].map(ep => (
            <div key={ep.path} className="flex items-start gap-3 text-sm">
              <span className="font-mono text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded w-12 text-center flex-shrink-0">
                {ep.method}
              </span>
              <span className="font-mono text-gray-600 dark:text-gray-400 min-w-0 truncate">{ep.path}</span>
              <span className="text-gray-400 hidden sm:block">—</span>
              <span className="text-gray-500 dark:text-gray-400 hidden sm:block">{ep.desc}</span>
            </div>
          ))}
        </div>
      </Card>

      <LicenceAttribution />
    </div>
  );
}
