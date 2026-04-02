import { useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useSystems } from '../hooks/useApi';
import { api } from '../lib/api';
import { Plus, Trash2, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface CurrentSystem {
  name: string;
  category: string;
  apiSupport: string;
}

interface AssessmentFindings {
  risks: string[];
  opportunities: string[];
  recommendations: string[];
}

interface AssessmentResult {
  id: string;
  name: string;
  complexityScore: number;
  riskLevel: string;
  findings: AssessmentFindings;
  targetSystem?: { name: string; vendor: string } | null;
}

const API_SUPPORTS = [
  'REST',
  'SOAP',
  'GraphQL',
  'Proprietary API',
  'CSV/Batch',
  'None',
];

const CATEGORIES = [
  'SIS',
  'LMS',
  'CRM',
  'HR',
  'Finance',
  'Library',
  'Timetabling',
  'Payments',
  'Email',
  'Other',
];

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  medium:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export function IntegrationAssessment() {
  const { data: systems } = useSystems();
  const [step, setStep] = useState(1);
  const [assessmentName, setAssessmentName] = useState('');
  const [currentSystems, setCurrentSystems] = useState<CurrentSystem[]>([
    { name: '', category: 'SIS', apiSupport: 'REST' },
  ]);
  const [targetSystemId, setTargetSystemId] = useState('');
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addSystem = () =>
    setCurrentSystems((prev) => [
      ...prev,
      { name: '', category: 'LMS', apiSupport: 'REST' },
    ]);

  const removeSystem = (i: number) =>
    setCurrentSystems((prev) => prev.filter((_, idx) => idx !== i));

  const updateSystem = (
    i: number,
    field: keyof CurrentSystem,
    value: string
  ) =>
    setCurrentSystems((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s))
    );

  const assess = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.createIntegrationAssessment({
        name: assessmentName,
        currentSystems,
        targetSystemId: targetSystemId || undefined,
      });
      setResult(res.data.data as AssessmentResult);
      setStep(4);
    } catch (e) {
      setError('Assessment failed — please try again');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const targetSystem = systems?.find((s) => s.id === targetSystemId);

  const reset = () => {
    setStep(1);
    setResult(null);
    setAssessmentName('');
    setCurrentSystems([{ name: '', category: 'SIS', apiSupport: 'REST' }]);
    setTargetSystemId('');
    setError(null);
  };

  const stepLabels = ['Name', 'Current Stack', 'Target System', 'Results'];

  return (
    <div>
      <Header
        title="Integration Assessment"
        subtitle="Assess technology stack compatibility and integration complexity for your target system"
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step >= s
                  ? 'bg-teal text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}
            >
              {step > s ? '✓' : s}
            </div>
            {s < 4 && (
              <div
                className={`w-12 h-0.5 transition-colors ${
                  step > s ? 'bg-teal' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            )}
          </div>
        ))}
        <span className="text-sm text-gray-500 ml-2">
          {stepLabels[step - 1]}
        </span>
      </div>

      <div className="max-w-2xl">
        {/* Step 1: Name */}
        {step === 1 && (
          <Card>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
              Name Your Assessment
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Give this assessment a descriptive name so you can reference it
              later.
            </p>
            <input
              value={assessmentName}
              onChange={(e) => setAssessmentName(e.target.value)}
              placeholder="e.g. SIS Replacement Readiness Assessment 2026"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white mb-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && assessmentName.trim()) setStep(2);
              }}
            />
            <Button onClick={() => setStep(2)} disabled={!assessmentName.trim()}>
              Next: Current Stack &rarr;
            </Button>
          </Card>
        )}

        {/* Step 2: Current systems */}
        {step === 2 && (
          <Card>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              Your Current Technology Stack
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Add each system currently in use. Be as specific as possible about
              API support.
            </p>

            <div className="space-y-3 mb-4">
              {currentSystems.map((sys, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <input
                      value={sys.name}
                      onChange={(e) => updateSystem(i, 'name', e.target.value)}
                      placeholder="System name"
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <select
                      value={sys.category}
                      onChange={(e) =>
                        updateSystem(i, 'category', e.target.value)
                      }
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <select
                      value={sys.apiSupport}
                      onChange={(e) =>
                        updateSystem(i, 'apiSupport', e.target.value)
                      }
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                      {API_SUPPORTS.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  {currentSystems.length > 1 && (
                    <button
                      onClick={() => removeSystem(i)}
                      className="text-gray-400 hover:text-red-500 mt-1.5 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="text-xs text-gray-400 mb-4">
              <span className="font-medium">Tip:</span> Name | Category | API
              Support
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={addSystem}>
                <Plus className="w-3 h-3 mr-1" />
                Add System
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={currentSystems.some((s) => !s.name.trim())}
              >
                Next: Target System &rarr;
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Target system */}
        {step === 3 && (
          <Card>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              Select Target System
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Which system are you evaluating for implementation?
            </p>

            <div className="grid grid-cols-2 gap-2 mb-4 max-h-80 overflow-y-auto">
              {(systems ?? []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setTargetSystemId(s.id)}
                  className={`text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                    targetSystemId === s.id
                      ? 'border-teal bg-teal/10 text-teal font-medium'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-gray-400">{s.vendor}</div>
                </button>
              ))}
            </div>

            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep(2)}>
                &larr; Back
              </Button>
              <Button
                onClick={assess}
                disabled={!targetSystemId || loading}
              >
                {loading ? 'Assessing…' : 'Run Assessment'}
              </Button>
            </div>
          </Card>
        )}

        {/* Step 4: Results */}
        {step === 4 && result && (
          <div className="space-y-4">
            {/* Summary card */}
            <Card>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-heading font-bold text-xl text-gray-900 dark:text-white">
                    {result.name}
                  </h3>
                  <p className="text-gray-500 text-sm">
                    Integration assessment: {currentSystems.length} current
                    system{currentSystems.length !== 1 ? 's' : ''} &rarr;{' '}
                    {targetSystem?.name ?? 'target system'}
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${
                    RISK_COLORS[result.riskLevel] ?? RISK_COLORS['medium']
                  }`}
                >
                  {result.riskLevel} Risk
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      result.complexityScore > 70
                        ? 'bg-red-500'
                        : result.complexityScore > 40
                        ? 'bg-amber-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${result.complexityScore}%` }}
                  />
                </div>
                <span className="text-lg font-bold text-gray-900 dark:text-white w-16 text-right">
                  {result.complexityScore}/100
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Integration Complexity Score — higher means more complex
              </p>
            </Card>

            {/* Risks */}
            {result.findings?.risks?.length > 0 && (
              <Card>
                <h3 className="font-semibold text-red-600 flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4" />
                  Integration Risks
                </h3>
                <ul className="space-y-2">
                  {result.findings.risks.map((r: string, i: number) => (
                    <li
                      key={i}
                      className="text-sm text-gray-700 dark:text-gray-300 flex gap-2"
                    >
                      <span className="text-red-500 mt-0.5 flex-shrink-0">
                        &#9888;
                      </span>
                      {r}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Recommendations */}
            {result.findings?.recommendations?.length > 0 && (
              <Card>
                <h3 className="font-semibold text-teal flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4" />
                  Recommendations
                </h3>
                <ul className="space-y-2">
                  {result.findings.recommendations.map(
                    (r: string, i: number) => (
                      <li
                        key={i}
                        className="text-sm text-gray-700 dark:text-gray-300 flex gap-2"
                      >
                        <span className="text-teal mt-0.5 flex-shrink-0">
                          &rarr;
                        </span>
                        {r}
                      </li>
                    )
                  )}
                </ul>
              </Card>
            )}

            {/* Opportunities */}
            {result.findings?.opportunities?.length > 0 && (
              <Card>
                <h3 className="font-semibold text-green-600 flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4" />
                  Opportunities
                </h3>
                <ul className="space-y-2">
                  {result.findings.opportunities.map(
                    (r: string, i: number) => (
                      <li
                        key={i}
                        className="text-sm text-gray-700 dark:text-gray-300 flex gap-2"
                      >
                        <span className="text-green-500 mt-0.5 flex-shrink-0">
                          +
                        </span>
                        {r}
                      </li>
                    )
                  )}
                </ul>
              </Card>
            )}

            {/* Current systems reviewed */}
            <Card>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                Systems Assessed
              </h3>
              <div className="space-y-2">
                {currentSystems.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <span className="font-medium w-40 truncate">{s.name}</span>
                    <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                      {s.category}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        s.apiSupport === 'REST' || s.apiSupport === 'GraphQL'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : s.apiSupport === 'None'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}
                    >
                      {s.apiSupport}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Button variant="secondary" onClick={reset}>
              New Assessment
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
