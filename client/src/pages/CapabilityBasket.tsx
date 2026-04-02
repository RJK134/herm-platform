import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ShoppingBasket, PlayCircle } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { SearchInput } from '../components/ui/SearchInput';
import { Modal } from '../components/ui/Modal';
import {
  useBaskets,
  useBasket,
  useBasketEvaluate,
  useCreateBasket,
  useAddBasketItem,
  useRemoveBasketItem,
} from '../hooks/useApi';
import { useCapabilities } from '../hooks/useApi';
import { useDebounce } from '../hooks/useDebounce';
import { formatPercent, scoreColor } from '../lib/utils';
import { CATEGORY_COLORS } from '../lib/constants';

export function CapabilityBasket() {
  const { t } = useTranslation('capabilities');
  const { data: baskets } = useBaskets();
  const [selectedBasketId, setSelectedBasketId] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEval, setShowEval] = useState(false);
  const [newBasketName, setNewBasketName] = useState('');
  const [newBasketDesc, setNewBasketDesc] = useState('');
  const [capSearch, setCapSearch] = useState('');
  const [addPriority, setAddPriority] = useState('must');
  const [addWeight, setAddWeight] = useState(1);
  const [addNotes, setAddNotes] = useState('');
  const [selectedCapCode, setSelectedCapCode] = useState('');

  const debouncedSearch = useDebounce(capSearch, 300);
  const { data: capabilities } = useCapabilities();

  const activeBasketId = selectedBasketId || (baskets?.[0]?.id ?? '');
  const { data: basket } = useBasket(activeBasketId);
  const { data: evaluation } = useBasketEvaluate(activeBasketId);

  const createBasket = useCreateBasket();
  const addItem = useAddBasketItem(activeBasketId);
  const removeItem = useRemoveBasketItem(activeBasketId);

  const filteredCaps = debouncedSearch
    ? (capabilities || []).filter(c =>
        c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        c.code.toLowerCase().includes(debouncedSearch.toLowerCase())
      ).slice(0, 20)
    : (capabilities || []).slice(0, 20);

  const handleCreateBasket = async () => {
    if (!newBasketName.trim()) return;
    const created = await createBasket.mutateAsync({ name: newBasketName, description: newBasketDesc });
    setSelectedBasketId(created.id);
    setNewBasketName('');
    setNewBasketDesc('');
    setShowCreateModal(false);
  };

  const handleAddItem = async () => {
    if (!selectedCapCode) return;
    await addItem.mutateAsync({ capabilityCode: selectedCapCode, priority: addPriority, weight: addWeight, notes: addNotes });
    setSelectedCapCode('');
    setAddNotes('');
    setShowAddModal(false);
  };

  return (
    <div>
      <Header
        title={t('basket.title', 'Capability Basket')}
        subtitle={t('basket.subtitle', 'Build a custom capability shortlist and evaluate systems against it')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Basket list */}
        <div>
          <Card>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800 dark:text-white">{t('basket.myBaskets', 'My Baskets')}</h3>
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> {t('basket.new', 'New')}
              </Button>
            </div>

            {!baskets || baskets.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                <ShoppingBasket className="w-8 h-8 mx-auto mb-2 opacity-40" />
                {t('basket.noBasketsYet', 'No baskets yet')}
              </div>
            ) : (
              <div className="space-y-2">
                {baskets.map(b => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBasketId(b.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors text-sm ${
                      b.id === activeBasketId
                        ? 'border-teal bg-teal/5 dark:bg-teal/10'
                        : 'border-gray-200 dark:border-gray-700 hover:border-teal/50'
                    }`}
                  >
                    <div className="font-medium text-gray-800 dark:text-white">{b.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{b.items.length} capabilities</div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Basket detail */}
        <div className="lg:col-span-2 space-y-6">
          {basket ? (
            <>
              <Card>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-800 dark:text-white text-lg">{basket.name}</h3>
                    {basket.description && (
                      <p className="text-sm text-gray-400 mt-0.5">{basket.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setShowAddModal(true)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> {t('basket.addCapability', 'Add Capability')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setShowEval(!showEval)}
                      disabled={basket.items.length === 0}
                    >
                      <PlayCircle className="w-3.5 h-3.5 mr-1" />
                      {showEval ? t('basket.hideEvaluation', 'Hide Evaluation') : t('basket.evaluate', 'Evaluate')}
                    </Button>
                  </div>
                </div>

                {basket.items.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    {t('basket.noCapabilities', 'No capabilities in this basket yet. Add some!')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {basket.items.map(item => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-teal">{item.capability.code}</span>
                            <span className="text-sm text-gray-800 dark:text-white truncate">{item.capability.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              item.priority === 'must' ? 'bg-red-100 text-red-700' :
                              item.priority === 'should' ? 'bg-amber-100 text-amber-700' :
                              item.priority === 'could' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {item.priority}
                            </span>
                            <span className="text-xs text-gray-400">weight: {item.weight}</span>
                            {item.notes && <span className="text-xs text-gray-400 truncate">{item.notes}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => removeItem.mutate(item.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {showEval && evaluation && evaluation.length > 0 && (
                <Card>
                  <h3 className="font-semibold text-gray-800 dark:text-white mb-4">
                    {t('basket.evaluation', 'Basket Evaluation \u2014 {{name}}', { name: basket.name })}
                  </h3>
                  <div className="space-y-3">
                    {evaluation.map(e => (
                      <div key={e.system.id} className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex-shrink-0">
                          {e.rank}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                {e.system.name}
                              </span>
                              <Badge text={e.system.category} category={e.system.category} />
                              {e.system.isOwnSystem && (
                                <span className="text-xs bg-teal text-white px-1.5 py-0.5 rounded">YOUR SYSTEM</span>
                              )}
                            </div>
                            <span className="text-sm font-bold" style={{ color: scoreColor(e.percentage) }}>
                              {formatPercent(e.percentage)}
                            </span>
                          </div>
                          <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${e.percentage}%`,
                                backgroundColor: CATEGORY_COLORS[e.system.category] || '#01696F',
                                transition: 'width 500ms ease-out',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <div className="text-center py-16 text-gray-400">
                <ShoppingBasket className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{t('basket.getStarted', 'Create or select a basket to get started')}</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Create basket modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title={t('basket.createTitle', 'Create New Basket')}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t('basket.nameLabel', 'Name *')}</label>
            <input
              value={newBasketName}
              onChange={e => setNewBasketName(e.target.value)}
              placeholder="e.g. Core SIS Requirements"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t('basket.descriptionLabel', 'Description')}</label>
            <textarea
              value={newBasketDesc}
              onChange={e => setNewBasketDesc(e.target.value)}
              rows={3}
              placeholder="Optional description..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>{t('basket.cancel', 'Cancel')}</Button>
            <Button onClick={handleCreateBasket} disabled={!newBasketName.trim()}>{t('basket.createBasket', 'Create Basket')}</Button>
          </div>
        </div>
      </Modal>

      {/* Add capability modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title={t('basket.addTitle', 'Add Capability to Basket')}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t('basket.searchCapability', 'Search Capability')}</label>
            <SearchInput value={capSearch} onChange={setCapSearch} placeholder="Search by name or code..." />
          </div>
          <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            {filteredCaps.map(c => (
              <button
                key={c.code}
                onClick={() => setSelectedCapCode(c.code)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors ${
                  selectedCapCode === c.code ? 'bg-teal/5 dark:bg-teal/10' : ''
                }`}
              >
                <span className="font-mono text-xs text-teal mr-2">{c.code}</span>
                <span className="text-gray-800 dark:text-white">{c.name}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t('basket.priority', 'Priority')}</label>
              <select
                value={addPriority}
                onChange={e => setAddPriority(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white"
              >
                <option value="must">{t('basket.mustHave', 'Must Have')}</option>
                <option value="should">{t('basket.shouldHave', 'Should Have')}</option>
                <option value="could">{t('basket.couldHave', 'Could Have')}</option>
                <option value="wont">{t('basket.wontHave', "Won't Have")}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t('basket.weight', 'Weight (1\u20135)')}</label>
              <input
                type="number"
                min={1}
                max={5}
                value={addWeight}
                onChange={e => setAddWeight(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t('basket.notes', 'Notes')}</label>
            <input
              value={addNotes}
              onChange={e => setAddNotes(e.target.value)}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>{t('basket.cancel', 'Cancel')}</Button>
            <Button onClick={handleAddItem} disabled={!selectedCapCode}>{t('basket.addToBasket', 'Add to Basket')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
