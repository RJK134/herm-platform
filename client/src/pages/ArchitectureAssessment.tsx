import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Plus, Trash2, Save, ChevronRight, ChevronLeft, Layers, AlertTriangle,
  CheckCircle, Info, AlertCircle, Server, RefreshCw,
} from 'lucide-react';
import axios from 'axios';
import type { ApiResponse } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SystemNode {
  id: string;
  name: string;
  category: string;
  vendor?: string;
  ageYears: number;
  criticalityScore: number;
  userCount: number;
  cloudNative: boolean;
  notes?: string;
}

interface IntegrationLink {
  fromId: string;
  toId: string;
  protocol: string;
  complexity: string;
  realTime: boolean;
}

interface Recommendation {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'positive';
  category: string;
  text: string;
  action: string;
}

interface AnalysisResult {
  overallRisk: number;
  readinessScore: number;
  recommendations: Recommendation[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SYSTEM_CATEGORIES = ['SIS', 'LMS', 'CRM', 'HCM', 'Finance', 'HR', 'Library', 'Portal', 'Email', 'VLE', 'Other'];
const PROTOCOLS = ['REST', 'SOAP', 'SFTP', 'Database', 'CSV', 'Message Queue', 'Proprietary', 'None'];
const ARCH_PATTERNS = [
  { id: 'point-to-point', label: 'Point-to-Point', desc: 'Direct system-to-system connections', risk: 'high' },
  { id: 'file-transfer', label: 'File Transfer (SFTP)', desc: 'Batch file exchange between systems', risk: 'medium' },
  { id: 'shared-database', label: 'Shared Database', desc: 'Systems sharing a common data store', risk: 'medium' },
  { id: 'messaging', label: 'Message Queue', desc: 'Asynchronous messaging between systems', risk: 'low' },
  { id: 'api-gateway', label: 'API Gateway', desc: 'Centralised API management layer', risk: 'low' },
  { id: 'esb', label: 'Enterprise Service Bus', desc: 'Centralised integration middleware', risk: 'low' },
  { id: 'ipaas', label: 'iPaaS', desc: 'Cloud integration platform (e.g. MuleSoft, Boomi)', risk: 'low' },
  { id: 'event-driven', label: 'Event-Driven', desc: 'Microservices with event streaming', risk: 'low' },
];

const SEVERITY_CONFIG = {
  critical: { colour: 'bg-red-100 border-red-300 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300', icon: AlertTriangle },
  high: { colour: 'bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-300', icon: AlertCircle },
  medium: { colour: 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300', icon: Info },
  low: { colour: 'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300', icon: Info },
  positive: { colour: 'bg-green-100 border-green-300 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300', icon: CheckCircle },
};

// ── Helper ────────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function riskColour(score: number) {
  if (score >= 70) return 'text-red-600 dark:text-red-400';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function readinessColour(score: number) {
  if (score >= 70) return 'text-green-600 dark:text-green-400';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function RiskBar({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-700 dark:text-gray-300 font-medium">{label}</span>
        <span className={`font-semibold ${riskColour(value)}`}>{value}</span>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-teal-600"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>Low risk</span><span>High risk</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ArchitectureAssessment() {
  const { t } = useTranslation('systems');
  const [step, setStep] = useState(1);
  const [assessmentName, setAssessmentName] = useState('');
  const [systems, setSystems] = useState<SystemNode[]>([]);
  const [links, setLinks] = useState<IntegrationLink[]>([]);
  const [pattern, setPattern] = useState('point-to-point');
  const [risks, setRisks] = useState({ data: 30, cutover: 40, integration: 35, change: 45 });
  const [notes, setNotes] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [saved, setSaved] = useState(false);

  // System form state
  const [newSystem, setNewSystem] = useState<Partial<SystemNode>>({ category: 'SIS', ageYears: 5, criticalityScore: 3, userCount: 0, cloudNative: false });

  // Fetch existing systems for target selection
  const { data: vendorSystems } = useQuery({
    queryKey: ['systems'],
    queryFn: () => axios.get<ApiResponse<{ id: string; name: string; vendor: string }[]>>('/api/systems').then((r) => r.data.data),
  });

  const analyseMutation = useMutation({
    mutationFn: (payload: object) =>
      axios.post<ApiResponse<AnalysisResult>>('/api/architecture/analyse', payload).then((r) => r.data.data),
    onSuccess: (data) => setAnalysis(data),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: object) =>
      axios.post<ApiResponse<unknown>>('/api/architecture', payload).then((r) => r.data.data),
    onSuccess: () => setSaved(true),
  });

  const buildPayload = useCallback(() => ({
    name: assessmentName || 'Architecture Assessment',
    currentSystems: systems,
    integrationLinks: links,
    architecturePattern: pattern,
    dataRisk: risks.data,
    cutoverRisk: risks.cutover,
    integrationRisk: risks.integration,
    changeRisk: risks.change,
    notes,
  }), [assessmentName, systems, links, pattern, risks, notes]);

  const runAnalysis = () => analyseMutation.mutate(buildPayload());
  const saveAssessment = () => saveMutation.mutate(buildPayload());

  const addSystem = () => {
    if (!newSystem.name?.trim()) return;
    setSystems((prev) => [...prev, { ...newSystem, id: uid() } as SystemNode]);
    setNewSystem({ category: 'SIS', ageYears: 5, criticalityScore: 3, userCount: 0, cloudNative: false });
  };

  const removeSystem = (id: string) => {
    setSystems((prev) => prev.filter((s) => s.id !== id));
    setLinks((prev) => prev.filter((l) => l.fromId !== id && l.toId !== id));
  };

  const toggleLink = (fromId: string, toId: string) => {
    const key = [fromId, toId].sort().join('-');
    const existing = links.find((l) => [l.fromId, l.toId].sort().join('-') === key);
    if (existing) {
      setLinks((prev) => prev.filter((l) => [l.fromId, l.toId].sort().join('-') !== key));
    } else {
      setLinks((prev) => [...prev, { fromId, toId, protocol: 'REST', complexity: 'medium', realTime: false }]);
    }
  };

  const isLinked = (a: string, b: string) =>
    links.some((l) => (l.fromId === a && l.toId === b) || (l.fromId === b && l.toId === a));

  const STEPS = ['Landscape', 'Integrations', 'Pattern', 'Risk', 'Results'];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('architecture.title', 'Architecture & System Landscape Assessment')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t('architecture.subtitle', 'Map your current IT estate, identify integration patterns, and get a readiness score for SIS replacement.')}</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const done = n < step;
          return (
            <div key={n} className="flex items-center gap-2">
              <button
                onClick={() => n <= step && setStep(n)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition ${
                  active ? 'bg-teal-600 text-white' :
                  done ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 cursor-pointer hover:bg-teal-200' :
                  'bg-gray-100 text-gray-400 dark:bg-gray-800 cursor-default'
                }`}
              >
                {done ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="w-4 text-center">{n}</span>}
                {label}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: System Landscape */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Server className="w-5 h-5 text-teal-600" /> Assessment Name & Current System Landscape
            </h2>
            <input
              value={assessmentName}
              onChange={(e) => setAssessmentName(e.target.value)}
              placeholder="e.g. Current Estate Assessment 2026"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white mb-5 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Add each existing system in your estate. Be comprehensive — include everything that integrates with student data.</p>

            {/* Add system form */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <input
                value={newSystem.name ?? ''}
                onChange={(e) => setNewSystem((p) => ({ ...p, name: e.target.value }))}
                placeholder="System name *"
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <select
                value={newSystem.category ?? 'SIS'}
                onChange={(e) => setNewSystem((p) => ({ ...p, category: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {SYSTEM_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input
                value={newSystem.vendor ?? ''}
                onChange={(e) => setNewSystem((p) => ({ ...p, vendor: e.target.value }))}
                placeholder="Vendor"
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 block mb-0.5">Age (yrs)</label>
                  <input
                    type="number" min={0} max={50}
                    value={newSystem.ageYears ?? 5}
                    onChange={(e) => setNewSystem((p) => ({ ...p, ageYears: Number(e.target.value) }))}
                    className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 block mb-0.5">Criticality</label>
                  <select
                    value={newSystem.criticalityScore ?? 3}
                    onChange={(e) => setNewSystem((p) => ({ ...p, criticalityScore: Number(e.target.value) }))}
                    className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newSystem.cloudNative ?? false}
                    onChange={(e) => setNewSystem((p) => ({ ...p, cloudNative: e.target.checked }))}
                    className="rounded"
                  />
                  Cloud-native
                </label>
              </div>
              <button
                onClick={addSystem}
                disabled={!newSystem.name?.trim()}
                className="col-span-3 flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white text-sm rounded-lg transition"
              >
                <Plus className="w-4 h-4" /> Add System
              </button>
            </div>

            {/* System list */}
            {systems.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No systems added yet. Add your first system above.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {systems.map((sys) => (
                  <div key={sys.id} className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">{sys.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400">{sys.category}</span>
                        {sys.cloudNative && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">Cloud</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {sys.vendor && <span>{sys.vendor} · </span>}
                        Age: {sys.ageYears}yr · Criticality: {sys.criticalityScore}/5
                      </div>
                    </div>
                    <button onClick={() => removeSystem(sys.id)} className="text-gray-400 hover:text-red-500 transition ml-2">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button onClick={() => setStep(2)} disabled={systems.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition">
              Next: Integration Map <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Integration Map */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Layers className="w-5 h-5 text-teal-600" /> System Integration Map
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Click cells in the matrix to mark which systems currently integrate with each other.</p>

            {systems.length < 2 ? (
              <p className="text-gray-400 text-sm text-center py-8">Add at least 2 systems in Step 1 to map integrations.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="w-28 text-right pr-2 text-gray-500 font-normal pb-2">From ↓ / To →</th>
                      {systems.map((s) => (
                        <th key={s.id} className="w-20 text-center pb-2 font-medium text-gray-700 dark:text-gray-300 px-1">
                          <div className="truncate max-w-[72px] mx-auto" title={s.name}>{s.name}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {systems.map((from) => (
                      <tr key={from.id}>
                        <td className="text-right pr-2 py-1 font-medium text-gray-700 dark:text-gray-300 truncate max-w-[100px]">{from.name}</td>
                        {systems.map((to) => {
                          if (from.id === to.id) return <td key={to.id} className="bg-gray-100 dark:bg-gray-700/50 w-20 h-8 text-center" />;
                          const linked = isLinked(from.id, to.id);
                          return (
                            <td key={to.id} className="w-20 h-8 text-center px-1 py-1">
                              <button
                                onClick={() => toggleLink(from.id, to.id)}
                                className={`w-full h-full rounded text-xs font-medium transition ${
                                  linked
                                    ? 'bg-teal-500 text-white hover:bg-teal-600'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                              >
                                {linked ? '✓' : '·'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {links.length > 0 && (
              <p className="text-sm text-teal-600 dark:text-teal-400 mt-3 font-medium">
                {links.length} integration link{links.length > 1 ? 's' : ''} mapped
              </p>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-white text-sm font-medium rounded-lg transition">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={() => setStep(3)} className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition">
              Next: Architecture Pattern <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Architecture Pattern */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Current Architecture Pattern</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Select the pattern that best describes how your current systems share data. This affects your architectural maturity score.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ARCH_PATTERNS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPattern(p.id)}
                  className={`p-4 rounded-xl border-2 text-left transition ${
                    pattern === p.id
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-gray-900 dark:text-white text-sm">{p.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.risk === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      p.risk === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    }`}>{p.risk} risk</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-white text-sm font-medium rounded-lg transition">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={() => setStep(4)} className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition">
              Next: Risk Assessment <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Risk Assessment */}
      {step === 4 && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
            <h2 className="font-semibold text-gray-900 dark:text-white">Risk Assessment</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Rate each risk dimension on a scale of 0 (low risk) to 100 (high risk). Be honest — this drives your recommendations.</p>

            <RiskBar label="Data Migration Risk — complexity, volume, quality of data to be migrated" value={risks.data} onChange={(v) => setRisks((r) => ({ ...r, data: v }))} />
            <RiskBar label="Cutover Risk — difficulty of switching over without disrupting academic operations" value={risks.cutover} onChange={(v) => setRisks((r) => ({ ...r, cutover: v }))} />
            <RiskBar label="Integration Risk — complexity of connecting the new SIS to your existing estate" value={risks.integration} onChange={(v) => setRisks((r) => ({ ...r, integration: v }))} />
            <RiskBar label="Change Management Risk — staff readiness, training needs, organisational resistance" value={risks.change} onChange={(v) => setRisks((r) => ({ ...r, change: v }))} />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Additional notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any additional context for this assessment..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-white text-sm font-medium rounded-lg transition">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => { runAnalysis(); setStep(5); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition"
            >
              Generate Analysis <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Results */}
      {step === 5 && (
        <div className="space-y-5">
          {analyseMutation.isPending && (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
              <RefreshCw className="w-5 h-5 animate-spin" /> Analysing architecture...
            </div>
          )}
          {analysis && (
            <>
              {/* Score cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Overall Risk Score</div>
                  <div className={`text-5xl font-bold ${riskColour(analysis.overallRisk)}`}>{analysis.overallRisk}</div>
                  <div className="text-sm text-gray-500 mt-1">out of 100</div>
                  <div className={`text-sm font-medium mt-2 ${riskColour(analysis.overallRisk)}`}>
                    {analysis.overallRisk >= 70 ? 'High risk' : analysis.overallRisk >= 40 ? 'Moderate risk' : 'Low risk'}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Architecture Readiness</div>
                  <div className={`text-5xl font-bold ${readinessColour(analysis.readinessScore)}`}>{analysis.readinessScore}</div>
                  <div className="text-sm text-gray-500 mt-1">out of 100</div>
                  <div className={`text-sm font-medium mt-2 ${readinessColour(analysis.readinessScore)}`}>
                    {analysis.readinessScore >= 70 ? 'Ready to proceed' : analysis.readinessScore >= 40 ? 'Proceed with caution' : 'Address risks first'}
                  </div>
                </div>
              </div>

              {/* Risk breakdown */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Risk Breakdown</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Data Migration', value: risks.data },
                    { label: 'Cutover', value: risks.cutover },
                    { label: 'Integration', value: risks.integration },
                    { label: 'Change Management', value: risks.change },
                  ].map((r) => (
                    <div key={r.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-400">{r.label}</span>
                        <span className={`font-medium ${riskColour(r.value)}`}>{r.value}</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                        <div
                          className={`h-full rounded-full transition-all ${r.value >= 70 ? 'bg-red-500' : r.value >= 40 ? 'bg-amber-500' : 'bg-green-500'}`}
                          style={{ width: `${r.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                  Recommendations ({analysis.recommendations.length})
                </h3>
                <div className="space-y-3">
                  {analysis.recommendations.length === 0 && (
                    <p className="text-gray-400 text-sm">No specific recommendations — your architecture appears well-positioned.</p>
                  )}
                  {analysis.recommendations.map((rec, i) => {
                    const cfg = SEVERITY_CONFIG[rec.severity];
                    const Icon = cfg.icon;
                    return (
                      <div key={i} className={`p-4 rounded-lg border ${cfg.colour}`}>
                        <div className="flex items-start gap-3">
                          <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">{rec.category}</div>
                            <p className="text-sm font-medium">{rec.text}</p>
                            <p className="text-sm mt-1.5 opacity-80">→ {rec.action}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Summary stats */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Landscape Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Systems Mapped', value: systems.length },
                    { label: 'Integration Links', value: links.length },
                    { label: 'Cloud-Native', value: `${systems.filter((s) => s.cloudNative).length}/${systems.length}` },
                    { label: 'Pattern', value: ARCH_PATTERNS.find((p) => p.id === pattern)?.label ?? pattern },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</div>
                      <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-between">
                <button onClick={() => setStep(4)} className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-white text-sm font-medium rounded-lg transition">
                  <ChevronLeft className="w-4 h-4" /> Adjust Risk
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={saveAssessment}
                    disabled={saveMutation.isPending || saved}
                    className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-medium rounded-lg transition"
                  >
                    <Save className="w-4 h-4" />
                    {saved ? 'Saved!' : saveMutation.isPending ? 'Saving...' : 'Save Assessment'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
