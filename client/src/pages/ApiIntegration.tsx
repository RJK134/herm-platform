import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Modal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PRODUCT } from '../lib/branding';

const TOKEN_KEY = 'herm_auth_token';
const authHeader = () => {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
};

interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface NewKeyResult {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  permissions: string[];
  warning: string;
}

const PERMISSION_OPTIONS = [
  { value: 'read:systems', label: 'Read Systems' },
  { value: 'read:capabilities', label: 'Read Capabilities' },
  { value: 'read:scores', label: 'Read Scores' },
  { value: 'read:baskets', label: 'Read Baskets' },
];

const CODE_EXAMPLES = {
  curl: (key: string) => `curl -H "Authorization: Bearer ${key}" \\
  https://api.herm-platform.ac.uk/api/systems`,

  python: (key: string) => `import requests

headers = {"Authorization": "Bearer ${key}"}

# Get all systems
resp = requests.get(
    "https://api.herm-platform.ac.uk/api/systems",
    headers=headers
)
systems = resp.json()["data"]`,

  javascript: (key: string) => `const headers = {
  "Authorization": "Bearer ${key}"
};

// Get all systems
const resp = await fetch(
  "https://api.herm-platform.ac.uk/api/systems",
  { headers }
);
const { data: systems } = await resp.json();`,

  ruby: (key: string) => `require 'net/http'
require 'json'

uri = URI("https://api.herm-platform.ac.uk/api/systems")
req = Net::HTTP::Get.new(uri)
req["Authorization"] = "Bearer ${key}"

http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = true
resp = http.request(req)
systems = JSON.parse(resp.body)["data"]`,
};

const ENDPOINTS = [
  { method: 'GET', path: '/api/systems', description: 'List all systems with optional category filter' },
  { method: 'GET', path: '/api/capabilities', description: 'List all 165 HERM capabilities' },
  { method: 'GET', path: '/api/scores/leaderboard', description: 'Ranked leaderboard of all systems' },
  { method: 'GET', path: '/api/scores/heatmap', description: 'Capability heatmap data matrix' },
  { method: 'GET', path: '/api/baskets', description: 'List your institution capability baskets' },
];

const RATE_LIMITS = [
  { plan: 'Standard API (no key)', limit: '300 requests / minute' },
  { plan: 'API Key (Basic tier)', limit: '1,000 requests / hour' },
  { plan: 'API Key (Enhanced)', limit: '5,000 requests / hour' },
  { plan: 'API Key (Premium)', limit: '20,000 requests / hour' },
];

export function ApiIntegration() {
  const { t } = useTranslation("admin");
  const [tab, setTab] = useState<'keys' | 'docs'>('keys');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>(['read:systems', 'read:capabilities', 'read:scores']);
  const [expiresAt, setExpiresAt] = useState('');
  const [createdKey, setCreatedKey] = useState<NewKeyResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeTab, setCodeTab] = useState<'curl' | 'python' | 'javascript' | 'ruby'>('curl');

  const qc = useQueryClient();

  const keysQuery = useQuery<ApiKeyRecord[]>({
    queryKey: ['api-keys'],
    queryFn: () =>
      axios.get<{ success: boolean; data: ApiKeyRecord[] }>('/api/keys', {
        headers: authHeader(),
      }).then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; permissions: string[]; expiresAt?: string }) =>
      axios.post<{ success: boolean; data: NewKeyResult }>('/api/keys', data, {
        headers: authHeader(),
      }).then(r => r.data.data),
    onSuccess: (data) => {
      setCreatedKey(data);
      setNewKeyName('');
      setSelectedPerms(['read:systems', 'read:capabilities', 'read:scores']);
      setExpiresAt('');
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      axios.delete(`/api/keys/${id}`, { headers: authHeader() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const handleCreate = () => {
    if (!newKeyName.trim()) return;
    createMutation.mutate({
      name: newKeyName.trim(),
      permissions: selectedPerms,
      ...(expiresAt ? { expiresAt } : {}),
    });
  };

  const handleCopy = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey.key).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const togglePerm = (perm: string) => {
    setSelectedPerms(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  };

  const keys = keysQuery.data ?? [];
  const exampleKey = 'herm_pk_live_xxxxxxxxxxxx';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("apiKeys.title", "API Integration")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t("apiKeys.subtitle", "Manage API keys and integrate HERM data with your systems.")}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(['keys', 'docs'] as const).map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === tabKey
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tabKey === 'keys' ? t('apiKeys.tabKeys', 'API Keys') : t('apiKeys.tabDocs', 'Documentation')}
          </button>
        ))}
      </div>

      {/* API KEYS TAB */}
      {tab === 'keys' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {keys.length} key{keys.length !== 1 ? 's' : ''} configured
            </p>
            <Button onClick={() => { setCreatedKey(null); setShowCreateModal(true); }}>
              {t("apiKeys.createKey", "Create API Key")}
            </Button>
          </div>

          {keys.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {t("apiKeys.noKeys", "No API keys yet. Create one to integrate HERM data with your systems.")}
              </p>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("apiKeys.colKey", "Key")}</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("apiKeys.colName", "Name")}</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("apiKeys.colPermissions", "Permissions")}</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("apiKeys.colLastUsed", "Last Used")}</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("apiKeys.colStatus", "Status")}</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("apiKeys.colActions", "Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map(k => (
                      <tr key={k.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-3 px-4">
                          <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded font-mono">
                            {k.keyPrefix}...
                          </code>
                        </td>
                        <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">{k.name}</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {k.permissions.map(p => (
                              <span key={p} className="text-xs bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded">
                                {p}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">
                          {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString('en-GB') : t("apiKeys.neverUsed", "Never used")}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            k.isActive
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          }`}>
                            {k.isActive ? t("apiKeys.active", "Active") : t("apiKeys.revoked", "Revoked")}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {k.isActive && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeMutation.mutate(k.id)}
                              className="text-red-500 hover:text-red-600"
                            >{t("apiKeys.revokeKey", "Revoke")}                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* DOCUMENTATION TAB */}
      {tab === 'docs' && (
        <div className="space-y-6">
          <Card>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">{t("apiKeys.restOverview", "REST API Overview")}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              The {PRODUCT.name} REST API provides programmatic access to system capability data, leaderboard scores,
              and procurement intelligence. All endpoints return JSON and follow the{' '}
              <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{ success, data, error }'}</code>{' '}
              envelope format. Authenticate by passing your API key in the{' '}
              <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">Authorization: Bearer</code> header.
            </p>
          </Card>

          {/* Endpoint reference */}
          <Card>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t("apiKeys.endpointReference", "Endpoint Reference")}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("apiKeys.colMethod", "Method")}</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("apiKeys.colEndpoint", "Endpoint")}</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("apiKeys.colDescription", "Description")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ENDPOINTS.map(ep => (
                    <tr key={ep.path} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2.5 px-3">
                        <span className="text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded">
                          {ep.method}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <code className="text-xs text-gray-800 dark:text-gray-200 font-mono">{ep.path}</code>
                      </td>
                      <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400 text-xs">{ep.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Code examples */}
          <Card>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t("apiKeys.codeExamples", "Code Examples")}</h2>
            <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
              {(['curl', 'python', 'javascript', 'ruby'] as const).map(lang => (
                <button
                  key={lang}
                  onClick={() => setCodeTab(lang)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                    codeTab === lang
                      ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                  }`}
                >
                  {lang === 'javascript' ? 'JavaScript' : lang.charAt(0).toUpperCase() + lang.slice(1)}
                </button>
              ))}
            </div>
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto font-mono leading-relaxed">
              {CODE_EXAMPLES[codeTab](exampleKey)}
            </pre>
          </Card>

          {/* Rate limits */}
          <Card>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t("apiKeys.rateLimits", "Rate Limits")}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("apiKeys.colPlan", "Plan")}</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("apiKeys.colLimit", "Limit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {RATE_LIMITS.map(rl => (
                    <tr key={rl.plan} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">{rl.plan}</td>
                      <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white">{rl.limit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* CREATE KEY MODAL */}
      <Modal
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); setCreatedKey(null); }}
        title={t("apiKeys.createKey", "Create API Key")}
      >
        {createdKey ? (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">{t("apiKeys.keyCreated", "API Key Created")}</p>
              <p className="text-xs text-amber-600 dark:text-amber-300">
                {t("apiKeys.keyWarning", "This key will only be shown once. Copy and store it securely.")}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{t("apiKeys.yourApiKey", "Your API Key")}</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-gray-900 text-green-400 px-3 py-2 rounded-lg text-xs font-mono break-all">
                  {createdKey.key}
                </code>
                <Button onClick={handleCopy} size="sm">
                  {copied ? t("apiKeys.keyCopied", "Copied!") : t("apiKeys.copyKey", "Copy Key")}
                </Button>
              </div>
            </div>
            <Button
              onClick={() => { setShowCreateModal(false); setCreatedKey(null); }}
              className="w-full"
            >{t("apiKeys.done", "Done")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("apiKeys.keyName", "Key Name")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                placeholder="e.g. Production Integration"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("apiKeys.permissions", "Permissions")}</label>
              <div className="space-y-2">
                {PERMISSION_OPTIONS.map(p => (
                  <label key={p.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPerms.includes(p.value)}
                      onChange={() => togglePerm(p.value)}
                      className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("apiKeys.expiresAt", "Expiry Date")} <span className="text-gray-400 text-xs">({t("apiKeys.optional", "optional")})</span>
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => setShowCreateModal(false)}
                className="flex-1"
              >{t("apiKeys.cancel", "Cancel")}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newKeyName.trim() || createMutation.isPending}
                className="flex-1"
              >
                {createMutation.isPending ? t("apiKeys.creating", "Creating...") : t("apiKeys.createKeyBtn", "Create Key")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
