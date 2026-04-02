import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResearch } from '../hooks/useApi';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { SearchInput } from '../components/ui/SearchInput';
import { useDebounce } from '../hooks/useDebounce';
import { ExternalLink } from 'lucide-react';
import type { ResearchItem } from '../types';

const TABS = ['All', 'Analyst Reports', 'Academic Research', 'Case Studies', 'Benchmarking', 'Sector Survey'] as const;

const PUBLISHER_COLORS: Record<string, string> = {
  Gartner: 'bg-blue-100 text-blue-800',
  EDUCAUSE: 'bg-purple-100 text-purple-800',
  UCISA: 'bg-teal-100 text-teal-800',
  Jisc: 'bg-orange-100 text-orange-800',
  Forrester: 'bg-green-100 text-green-800',
  IDC: 'bg-red-100 text-red-800',
  Omdia: 'bg-yellow-100 text-yellow-800',
  UNESCO: 'bg-indigo-100 text-indigo-800',
  HESA: 'bg-pink-100 text-pink-800',
  OfS: 'bg-rose-100 text-rose-800',
};

export function ResearchHub() {
  const { t } = useTranslation('common');
  const { data: items, isLoading } = useResearch();
  const [activeTab, setActiveTab] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<ResearchItem | null>(null);
  const debouncedSearch = useDebounce(search);

  const filtered = (items ?? []).filter(item => {
    const matchTab = activeTab === 'All' || item.category === activeTab;
    const matchSearch = !debouncedSearch ||
      item.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      item.publisher.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      (item.summary ?? '').toLowerCase().includes(debouncedSearch.toLowerCase());
    return matchTab && matchSearch;
  });

  return (
    <div>
      <Header title={t('research.title', 'Research & Evidence Hub')} subtitle={t('research.subtitle', 'Analyst reports, academic research, case studies, and benchmarking data')} />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-4">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all duration-200 ${activeTab === tab ? 'bg-teal text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-teal/10 hover:text-teal-700 dark:hover:text-teal-300'}`}
          >
            {tab}
            {tab !== 'All' && <span className="ml-1 opacity-60">({(items ?? []).filter(i => i.category === tab).length})</span>}
            {tab === 'All' && <span className="ml-1 opacity-60">({(items ?? []).length})</span>}
          </button>
        ))}
      </div>

      <div className="mb-4 w-72">
        <SearchInput value={search} onChange={setSearch} placeholder="Search research..." />
      </div>

      {isLoading && <div className="text-gray-400 text-center py-12">{t('research.loading', 'Loading research items...')}</div>}

      {selectedItem ? (
        <div>
          <button onClick={() => setSelectedItem(null)} className="text-sm text-teal hover:underline mb-4 block">{t('research.backToList', '\u2190 Back to research list')}</button>
          <Card>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PUBLISHER_COLORS[selectedItem.publisher] || 'bg-gray-100 text-gray-700'}`}>{selectedItem.publisher}</span>
                  <span className="text-xs text-gray-500">{selectedItem.year}</span>
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">{selectedItem.category}</span>
                </div>
                <h2 className="text-xl font-heading font-bold text-gray-900 dark:text-white">{selectedItem.title}</h2>
              </div>
              {selectedItem.url && (
                <a href={selectedItem.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-teal text-sm hover:underline flex-shrink-0 ml-4">
                  <ExternalLink className="w-4 h-4" /> View Source
                </a>
              )}
            </div>
            {selectedItem.summary && <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">{selectedItem.summary}</p>}
            <div className="flex flex-wrap gap-2">
              {selectedItem.tags.map(tag => <Badge key={tag} text={tag} className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" />)}
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(item => (
            <Card key={item.id} className="cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PUBLISHER_COLORS[item.publisher] || 'bg-gray-100 text-gray-700'}`}>{item.publisher}</span>
                <span className="text-xs text-gray-400">{item.year}</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-2 line-clamp-2 leading-snug">{item.title}</h3>
              {item.summary && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 mb-3">{item.summary}</p>}
              <div className="flex flex-wrap gap-1 mb-3">
                {item.tags.slice(0, 3).map(tag => <Badge key={tag} text={tag} className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs" />)}
              </div>
              <button onClick={() => setSelectedItem(item)} className="text-xs text-teal font-medium hover:underline">Read more →</button>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">No research items found. Try adjusting filters or run the seed to populate data.</div>
      )}
    </div>
  );
}
