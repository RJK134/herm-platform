import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  TrendingUp, PoundSterling, Clock, BarChart2, Save, RefreshCw,
  ChevronRight, ChevronLeft, Info, CheckCircle, AlertTriangle,
  Users, BookOpen, Target, Briefcase,
} from 'lucide-react';
import axios from 'axios';
import type { ApiResponse } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValueInput {
  name: string;
  systemId: string;
  studentFte: number;
  staffFte: number;
  institutionType: string;
  currentSystemCostAnnual: number;
  currentMaintenanceCost: number;
  currentSupportCost: number;
  adminEfficiencyPct: number;
  adminStaffAffected: number;
  avgAdminSalaryGbp: number;
  registryEfficiencyPct: number;
  registryStaffAffected: number;
  avgRegistrySalaryGbp: number;
  errorReductionPct: number;
  errorCostCurrentAnnual: number;
  complianceSavingAnnual: number;
  studentExperienceValue: number;
  otherBenefitsAnnual: number;
  implementationCost: number;
  annualLicenceCost: number;
  annualSupportCost: number;
  annualInternalStaffCost: number;
  notes: string;
}

interface CashflowYear {
  year: number;
  costs: number;
  benefits: number;
  net: number;
  cumulative: number;
}

interface ValueResult {
  adminBenefit: number;
  registryBenefit: number;
  errorBenefit: number;
  complianceBenefit: number;
  studentBenefit: number;
  otherBenefit: number;
  totalAnnualBenefits: number;
  annualLicenceCost: number;
  annualSupportCost: number;
  annualInternalStaffCost: number;
  totalAnnualCosts: number;
  netAnnualBenefit: number;
  roi3Year: number;
  roi5Year: number;
  npv5Year: number;
  paybackMonths: number;
  breakEvenYear: number | null;
  currentStateTotalAnnual: number;
  savingVsCurrentState: number;
  cashflowByYear: CashflowYear[];
}

interface Benchmark {
  conservative: number;
  central: number;
  optimistic: number;
  description: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const roiColour = (roi: number) => {
  if (roi >= 100) return 'text-emerald-600 dark:text-emerald-400';
  if (roi >= 50) return 'text-teal-600 dark:text-teal-400';
  if (roi >= 0) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

const npvColour = (npv: number) =>
  npv >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';

const STEPS = ['Setup', 'Current State', 'Benefits', 'Investment', 'Results'] as const;
type Step = typeof STEPS[number];

const INSTITUTION_TYPES = [
  { value: 'pre-92', label: 'Pre-92 University (Russell Group, Plateglass)' },
  { value: 'post-92', label: 'Post-92 University (former Polytechnic)' },
  { value: 'specialist', label: 'Specialist Institution (Arts, Music, Medical)' },
  { value: 'international', label: 'International Branch Campus' },
  { value: 'other', label: 'Other' },
];

const DEFAULT: ValueInput = {
  name: '',
  systemId: '',
  studentFte: 10000,
  staffFte: 500,
  institutionType: 'pre-92',
  currentSystemCostAnnual: 0,
  currentMaintenanceCost: 0,
  currentSupportCost: 0,
  adminEfficiencyPct: 15,
  adminStaffAffected: 20,
  avgAdminSalaryGbp: 35000,
  registryEfficiencyPct: 18,
  registryStaffAffected: 8,
  avgRegistrySalaryGbp: 42000,
  errorReductionPct: 45,
  errorCostCurrentAnnual: 100000,
  complianceSavingAnnual: 50000,
  studentExperienceValue: 0,
  otherBenefitsAnnual: 0,
  implementationCost: 500000,
  annualLicenceCost: 150000,
  annualSupportCost: 30000,
  annualInternalStaffCost: 60000,
  notes: '',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function NumberField({
  label, value, onChange, prefix = '', suffix = '',
  min = 0, step = 1000, hint, compact,
}: {
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; min?: number; step?: number;
  hint?: string; compact?: boolean;
}) {
  return (
    <div className={compact ? '' : 'space-y-1'}>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden focus-within:ring-2 focus-within:ring-teal-500">
        {prefix && <span className="px-3 py-2 text-gray-500 dark:text-gray-400 text-sm bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">{prefix}</span>}
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 px-3 py-2 text-sm bg-transparent outline-none text-gray-900 dark:text-white"
        />
        {suffix && <span className="px-3 py-2 text-gray-500 dark:text-gray-400 text-sm">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function SliderField({
  label, value, onChange, min = 0, max = 100, benchmarkMin, benchmarkMax,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; benchmarkMin?: number; benchmarkMax?: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
        <span className="text-sm font-semibold text-teal-600 dark:text-teal-400">{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-teal-600"
      />
      {benchmarkMin !== undefined && benchmarkMax !== undefined && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          UK HE benchmark: {benchmarkMin}%–{benchmarkMax}%
        </div>
      )}
    </div>
  );
}

function BenchmarkCard({ title, conservative, central, optimistic, description }: Benchmark & { title: string }) {
  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
      <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">{title}</div>
      <div className="flex gap-4 text-xs mb-1">
        <span className="text-gray-600 dark:text-gray-400">Conservative: <strong>{conservative}%</strong></span>
        <span className="text-blue-700 dark:text-blue-300">Central: <strong>{central}%</strong></span>
        <span className="text-emerald-700 dark:text-emerald-300">Optimistic: <strong>{optimistic}%</strong></span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

function ResultCard({
  label, value, sub, colour, icon: Icon,
}: {
  label: string; value: string; sub?: string; colour: string; icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 ${colour}`} />
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${colour}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

// ── Cashflow Chart (pure CSS bars) ─────────────────────────────────────────────

function CashflowChart({ data }: { data: CashflowYear[] }) {
  const maxAbs = Math.max(...data.map(d => Math.max(Math.abs(d.costs), Math.abs(d.benefits), Math.abs(d.cumulative))));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">5-Year Cashflow Projection</h3>
      <div className="space-y-3">
        {data.map(row => (
          <div key={row.year} className="grid grid-cols-[3rem_1fr_1fr_1fr_5rem] gap-2 items-center text-xs">
            <div className="text-gray-500 dark:text-gray-400 font-medium">
              {row.year === 0 ? 'Yr 0' : `Yr ${row.year}`}
            </div>
            {/* Costs bar */}
            <div className="flex items-center gap-1">
              <div className="text-red-500/70 w-4 text-right">↑</div>
              <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                <div
                  className="h-full bg-red-400/70 rounded"
                  style={{ width: `${(row.costs / maxAbs) * 100}%` }}
                />
              </div>
            </div>
            {/* Benefits bar */}
            <div className="flex items-center gap-1">
              <div className="text-emerald-500/70 w-4 text-right">↑</div>
              <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                <div
                  className="h-full bg-emerald-400/70 rounded"
                  style={{ width: `${(row.benefits / maxAbs) * 100}%` }}
                />
              </div>
            </div>
            {/* Cumulative */}
            <div className="flex items-center gap-1">
              <div className="text-blue-500/70 w-4 text-right">≈</div>
              <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden relative">
                <div
                  className={`h-full rounded ${row.cumulative >= 0 ? 'bg-blue-400/70' : 'bg-orange-400/70'}`}
                  style={{ width: `${(Math.abs(row.cumulative) / maxAbs) * 100}%` }}
                />
              </div>
            </div>
            {/* Cumulative value */}
            <div className={`text-right font-mono font-medium ${row.cumulative >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {fmt(row.cumulative)}
            </div>
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-red-400/70 inline-block" /> Costs</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-emerald-400/70 inline-block" /> Benefits</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-blue-400/70 inline-block" /> Cumulative</span>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function ValueAnalysis() {
  const { t } = useTranslation('systems');
  const [step, setStep] = useState<number>(0);
  const [form, setForm] = useState<ValueInput>(DEFAULT);
  const [result, setResult] = useState<ValueResult | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const set = <K extends keyof ValueInput>(key: K, val: ValueInput[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  // Fetch systems for dropdown
  const { data: systemsData } = useQuery({
    queryKey: ['systems'],
    queryFn: () => axios.get<ApiResponse<{ id: string; name: string; vendor: string }[]>>('/api/systems'),
    staleTime: 5 * 60 * 1000,
  });
  const systems = systemsData?.data?.data ?? [];

  // Fetch benchmarks
  const { data: benchData } = useQuery({
    queryKey: ['value-benchmarks'],
    queryFn: () => axios.get<ApiResponse<Record<string, Benchmark>>>('/api/value/benchmarks'),
    staleTime: 30 * 60 * 1000,
  });
  const benchmarks = benchData?.data?.data;

  // Calculate (stateless)
  const calcMutation = useMutation({
    mutationFn: (data: ValueInput) =>
      axios.post<ApiResponse<ValueResult>>('/api/value/calculate', data),
    onSuccess: (res) => {
      if (res.data?.data) {
        setResult(res.data.data);
        setStep(4);
      }
    },
  });

  // Save
  const saveMutation = useMutation({
    mutationFn: (data: ValueInput) =>
      axios.post<ApiResponse<{ id: string }>>('/api/value', data),
    onSuccess: (res) => {
      if (res.data?.data?.id) setSavedId(res.data.data.id);
    },
  });

  const canCalc =
    form.name.trim().length >= 2 &&
    (form.implementationCost > 0 || form.annualLicenceCost > 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-teal-600" />
          {t('value.title', 'Cost & Value Analysis')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Build a business case using HM Treasury Green Book methodology. Calculate ROI, NPV, and payback period with UK HE sector benchmarks.
        </p>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-1">
            <button
              onClick={() => { if (i < step || i <= 3) setStep(i); }}
              className={`flex-1 text-xs py-2 px-1 rounded text-center font-medium transition-colors ${
                i === step
                  ? 'bg-teal-600 text-white'
                  : i < step
                  ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 cursor-pointer hover:bg-teal-200'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-default'
              }`}
            >
              {i + 1}. {s}
            </button>
            {i < STEPS.length - 1 && (
              <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 0: Setup ── */}
      {step === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Analysis Setup</h2>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Analysis Name *</label>
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. SIS Replacement Business Case 2025"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Target System (optional)</label>
              <select
                value={form.systemId}
                onChange={e => set('systemId', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">— No specific system —</option>
                {systems.map(s => (
                  <option key={s.id} value={s.id}>{s.vendor} {s.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Institution Type</label>
              <select
                value={form.institutionType}
                onChange={e => set('institutionType', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
              >
                {INSTITUTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <NumberField label="Student FTE" value={form.studentFte} onChange={v => set('studentFte', v)} step={500} suffix="students" hint="Full-time equivalent enrolments" />
              <NumberField label="Staff FTE" value={form.staffFte} onChange={v => set('staffFte', v)} step={50} suffix="staff" hint="Professional services + academic" />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={3}
                placeholder="Context, assumptions, caveats..."
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <Info className="w-4 h-4" /> About This Tool
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              This tool applies <strong>HM Treasury Green Book</strong> methodology with a 3.5% NPV discount rate — the standard for UK public sector business cases.
            </p>
            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
              <li>ROI calculated over 3 and 5 years</li>
              <li>NPV discounted at 3.5% annually</li>
              <li>Month-by-month payback calculation</li>
              <li>UK HE sector benchmarks built in</li>
            </ul>
            <div className="bg-blue-100 dark:bg-blue-900/40 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-200">
              <strong>Tip:</strong> Use sector benchmarks on subsequent steps to guide your estimates.
            </div>
          </div>
        </div>
      )}

      {/* ── Step 1: Current State ── */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Current System Costs (Annual)</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Enter your current annual spend on the system(s) being replaced.</p>
            </div>

            <NumberField
              label="Licence / Subscription Cost"
              value={form.currentSystemCostAnnual}
              onChange={v => set('currentSystemCostAnnual', v)}
              prefix="£"
              step={10000}
              hint="Annual licence or SaaS subscription fees for current system(s)"
            />
            <NumberField
              label="Maintenance & Support Cost"
              value={form.currentMaintenanceCost}
              onChange={v => set('currentMaintenanceCost', v)}
              prefix="£"
              step={5000}
              hint="Vendor maintenance, third-party support contracts"
            />
            <NumberField
              label="Internal IT Support Cost"
              value={form.currentSupportCost}
              onChange={v => set('currentSupportCost', v)}
              prefix="£"
              step={5000}
              hint="Internal staff cost for managing current system (infrastructure, helpdesk)"
            />

            {(form.currentSystemCostAnnual + form.currentMaintenanceCost + form.currentSupportCost) > 0 && (
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Total Current State Annual Spend</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {fmt(form.currentSystemCostAnnual + form.currentMaintenanceCost + form.currentSupportCost)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {fmt((form.currentSystemCostAnnual + form.currentMaintenanceCost + form.currentSupportCost) / form.studentFte)} per student FTE
                </div>
              </div>
            )}
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <Briefcase className="w-4 h-4" /> UK HE Cost Benchmarks
            </h3>
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
              <div className="bg-amber-100 dark:bg-amber-900/40 rounded p-2">
                <strong>Small institution</strong> (&lt;5k FTE)<br />
                SIS licence: £80k–£150k/yr
              </div>
              <div className="bg-amber-100 dark:bg-amber-900/40 rounded p-2">
                <strong>Medium institution</strong> (5k–15k FTE)<br />
                SIS licence: £150k–£350k/yr
              </div>
              <div className="bg-amber-100 dark:bg-amber-900/40 rounded p-2">
                <strong>Large institution</strong> (&gt;15k FTE)<br />
                SIS licence: £350k–£700k/yr
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-xs italic">Include all modules (student records, admissions, assessment, finance).</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Benefits ── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Admin efficiency */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-600" />
              Administrative Efficiency
            </h2>
            {benchmarks?.adminEfficiency && (
              <BenchmarkCard
                title="Admin Staff Efficiency Benchmark"
                {...benchmarks.adminEfficiency}
              />
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SliderField
                label="Admin time saving (%)"
                value={form.adminEfficiencyPct}
                onChange={v => set('adminEfficiencyPct', v)}
                benchmarkMin={8}
                benchmarkMax={22}
              />
              <NumberField label="Admin staff affected" value={form.adminStaffAffected} onChange={v => set('adminStaffAffected', v)} step={1} hint="Headcount (FTE) who benefit" />
              <NumberField label="Avg admin salary" value={form.avgAdminSalaryGbp} onChange={v => set('avgAdminSalaryGbp', v)} prefix="£" step={1000} hint="UK HE benchmark: £28k–£38k" />
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Calculated benefit: <strong className="text-teal-600 dark:text-teal-400">
                {fmt(form.adminStaffAffected * form.avgAdminSalaryGbp * (form.adminEfficiencyPct / 100))} / year
              </strong>
            </div>
          </div>

          {/* Registry efficiency */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              Registry &amp; Academic Services Efficiency
            </h2>
            {benchmarks?.registryEfficiency && (
              <BenchmarkCard
                title="Registry Staff Efficiency Benchmark"
                {...benchmarks.registryEfficiency}
              />
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SliderField
                label="Registry time saving (%)"
                value={form.registryEfficiencyPct}
                onChange={v => set('registryEfficiencyPct', v)}
                benchmarkMin={10}
                benchmarkMax={28}
              />
              <NumberField label="Registry staff affected" value={form.registryStaffAffected} onChange={v => set('registryStaffAffected', v)} step={1} hint="Headcount (FTE) who benefit" />
              <NumberField label="Avg registry salary" value={form.avgRegistrySalaryGbp} onChange={v => set('avgRegistrySalaryGbp', v)} prefix="£" step={1000} hint="UK HE benchmark: £38k–£52k" />
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Calculated benefit: <strong className="text-blue-600 dark:text-blue-400">
                {fmt(form.registryStaffAffected * form.avgRegistrySalaryGbp * (form.registryEfficiencyPct / 100))} / year
              </strong>
            </div>
          </div>

          {/* Strategic benefits */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-600" />
              Strategic &amp; Compliance Benefits
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-3">
                <SliderField
                  label="Error/rework reduction (%)"
                  value={form.errorReductionPct}
                  onChange={v => set('errorReductionPct', v)}
                  benchmarkMin={20}
                  benchmarkMax={70}
                />
                <NumberField
                  label="Current annual error/rework cost"
                  value={form.errorCostCurrentAnnual}
                  onChange={v => set('errorCostCurrentAnnual', v)}
                  prefix="£"
                  step={10000}
                  hint="HESA resubmissions, manual corrections, reconciliation"
                />
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Benefit: <strong className="text-purple-600 dark:text-purple-400">
                    {fmt(form.errorCostCurrentAnnual * (form.errorReductionPct / 100))} / year
                  </strong>
                </div>
              </div>

              <div className="space-y-3">
                <NumberField
                  label="Compliance risk saving (annual)"
                  value={form.complianceSavingAnnual}
                  onChange={v => set('complianceSavingAnnual', v)}
                  prefix="£"
                  step={10000}
                  hint="GDPR fine avoidance, OfS regulatory risk, HESA quality improvement"
                />
                <NumberField
                  label="Student experience value"
                  value={form.studentExperienceValue}
                  onChange={v => set('studentExperienceValue', v)}
                  prefix="£"
                  step={10000}
                  hint="NSS/satisfaction improvement value (£250k per 1pt at 10k FTE)"
                />
                <NumberField
                  label="Other quantified benefits"
                  value={form.otherBenefitsAnnual}
                  onChange={v => set('otherBenefitsAnnual', v)}
                  prefix="£"
                  step={5000}
                  hint="Income generation, partnership savings, estate optimisation"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Investment ── */}
      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">New System Investment Costs</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Enter the costs of implementing and running the new system.</p>
            </div>

            <NumberField
              label="Implementation / one-off cost"
              value={form.implementationCost}
              onChange={v => set('implementationCost', v)}
              prefix="£"
              step={50000}
              hint="Project cost: software, configuration, data migration, training, PM"
            />

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">Annual Running Costs</div>
              <div className="space-y-4">
                <NumberField
                  label="Annual licence / SaaS cost"
                  value={form.annualLicenceCost}
                  onChange={v => set('annualLicenceCost', v)}
                  prefix="£"
                  step={10000}
                  hint="Vendor annual licence or subscription fee"
                />
                <NumberField
                  label="Annual vendor support cost"
                  value={form.annualSupportCost}
                  onChange={v => set('annualSupportCost', v)}
                  prefix="£"
                  step={5000}
                  hint="Vendor support contract (typically 15–20% of licence)"
                />
                <NumberField
                  label="Annual internal IT staff cost"
                  value={form.annualInternalStaffCost}
                  onChange={v => set('annualInternalStaffCost', v)}
                  prefix="£"
                  step={5000}
                  hint="Internal staff to manage/administer the new system"
                />
              </div>
            </div>

            {(form.annualLicenceCost + form.annualSupportCost + form.annualInternalStaffCost) > 0 && (
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Total Annual Running Cost</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {fmt(form.annualLicenceCost + form.annualSupportCost + form.annualInternalStaffCost)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {fmt((form.annualLicenceCost + form.annualSupportCost + form.annualInternalStaffCost) / form.studentFte)} per student FTE
                </div>
              </div>
            )}
          </div>

          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <PoundSterling className="w-4 h-4" /> Implementation Cost Ranges
            </h3>
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
              <div className="bg-emerald-100 dark:bg-emerald-900/40 rounded p-2">
                <strong>Small SaaS deployment</strong><br />
                Impl: £200k–£500k<br />
                Annual: £100k–£200k
              </div>
              <div className="bg-emerald-100 dark:bg-emerald-900/40 rounded p-2">
                <strong>Mid-size on-premise / hybrid</strong><br />
                Impl: £500k–£2m<br />
                Annual: £200k–£450k
              </div>
              <div className="bg-emerald-100 dark:bg-emerald-900/40 rounded p-2">
                <strong>Large enterprise deployment</strong><br />
                Impl: £2m–£8m<br />
                Annual: £450k–£900k
              </div>
            </div>
            {canCalc ? (
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                <CheckCircle className="w-4 h-4" /> Ready to calculate
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs">
                <AlertTriangle className="w-4 h-4" /> Add a name and at least one cost to calculate
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 4: Results ── */}
      {step === 4 && result && (
        <div className="space-y-5">
          {/* Top KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <ResultCard
              label="5-Year ROI"
              value={fmtPct(result.roi5Year)}
              sub={`3yr: ${fmtPct(result.roi3Year)}`}
              colour={roiColour(result.roi5Year)}
              icon={TrendingUp}
            />
            <ResultCard
              label="NPV (5yr, 3.5%)"
              value={fmt(result.npv5Year)}
              sub="HM Treasury Green Book rate"
              colour={npvColour(result.npv5Year)}
              icon={PoundSterling}
            />
            <ResultCard
              label="Payback Period"
              value={result.paybackMonths > 0 ? `${result.paybackMonths} months` : 'No payback'}
              sub={result.breakEvenYear ? `Break-even in Year ${result.breakEvenYear}` : undefined}
              colour={result.paybackMonths > 0 && result.paybackMonths <= 36 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}
              icon={Clock}
            />
            <ResultCard
              label="Net Annual Benefit"
              value={fmt(result.netAnnualBenefit)}
              sub={`Benefits: ${fmt(result.totalAnnualBenefits)} / Costs: ${fmt(result.totalAnnualCosts)}`}
              colour={result.netAnnualBenefit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
              icon={BarChart2}
            />
          </div>

          {/* Benefit breakdown + cashflow */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Benefit breakdown */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Annual Benefit Breakdown</h3>
              {[
                { label: 'Admin efficiency', value: result.adminBenefit, colour: 'bg-teal-400' },
                { label: 'Registry efficiency', value: result.registryBenefit, colour: 'bg-blue-400' },
                { label: 'Error reduction', value: result.errorBenefit, colour: 'bg-purple-400' },
                { label: 'Compliance savings', value: result.complianceBenefit, colour: 'bg-amber-400' },
                { label: 'Student experience', value: result.studentBenefit, colour: 'bg-pink-400' },
                { label: 'Other benefits', value: result.otherBenefit, colour: 'bg-gray-400' },
              ].map(({ label, value, colour }) => (
                <div key={label} className="flex items-center gap-3 mb-2">
                  <div className="w-28 text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">{label}</div>
                  <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                    <div
                      className={`h-full ${colour} rounded`}
                      style={{ width: `${result.totalAnnualBenefits > 0 ? (value / result.totalAnnualBenefits) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="text-xs font-mono text-gray-700 dark:text-gray-300 w-24 text-right">{fmt(value)}</div>
                </div>
              ))}
              <div className="border-t border-gray-100 dark:border-gray-700 mt-3 pt-3 flex justify-between text-sm font-semibold">
                <span className="text-gray-700 dark:text-gray-300">Total</span>
                <span className="text-emerald-600 dark:text-emerald-400">{fmt(result.totalAnnualBenefits)}</span>
              </div>
            </div>

            {/* Current state comparison */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Cost Comparison</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Current state (annual)</span>
                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">{fmt(result.currentStateTotalAnnual)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">New system running cost (annual)</span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{fmt(result.totalAnnualCosts)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Run cost saving vs current</span>
                  <span className={`text-sm font-semibold ${result.savingVsCurrentState >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {result.savingVsCurrentState >= 0 ? '+' : ''}{fmt(result.savingVsCurrentState)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Implementation investment</span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{fmt(form.implementationCost)}</span>
                </div>
              </div>

              {/* HM Treasury note */}
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-400">
                <strong>NPV methodology:</strong> Cashflows discounted at 3.5% per annum per HM Treasury Green Book (2022). Suitable for use in HE institution business cases submitted to governors or OfS.
              </div>
            </div>
          </div>

          {/* Cashflow chart */}
          <CashflowChart data={result.cashflowByYear} />

          {/* Save */}
          {savedId ? (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              Analysis saved (ID: {savedId}). You can reference this in Document Generator.
            </div>
          ) : (
            <button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Saving…' : 'Save Analysis'}
            </button>
          )}
        </div>
      )}

      {/* ── Step 4: No result yet ── */}
      {step === 4 && !result && (
        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-amber-800 dark:text-amber-200 font-medium">Calculation not yet run</p>
          <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">Return to step 4 and click Calculate.</p>
          <button onClick={() => setStep(3)} className="mt-3 text-amber-700 dark:text-amber-300 underline text-sm">← Go back</button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        {step < 3 && (
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={step === 0 && form.name.trim().length < 2}
            className="flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {step === 3 && (
          <button
            onClick={() => calcMutation.mutate(form)}
            disabled={!canCalc || calcMutation.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${calcMutation.isPending ? 'animate-spin' : ''}`} />
            {calcMutation.isPending ? 'Calculating…' : 'Calculate ROI & NPV'}
          </button>
        )}
      </div>
    </div>
  );
}
