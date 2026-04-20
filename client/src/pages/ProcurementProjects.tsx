import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { ApiResponse } from '../types';
import {
  Plus, ChevronLeft, CheckCircle, Clock, AlertTriangle, XCircle,
  Circle, ChevronRight, CalendarDays, BarChart2, Layers, Flag,
  Lock, RefreshCw, AlertCircle,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';

// ── Types ─────────────────────────────────────────────────────────────────────

type Jurisdiction = 'UK' | 'EU' | 'US_FEDERAL' | 'US_STATE' | 'AU';
type ProjectStatus = 'draft' | 'active' | 'awarded' | 'cancelled';
type StageStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'BLOCKED';
type Currency = 'GBP' | 'EUR' | 'USD' | 'AUD';
type ProcurementRoute = 'OPEN' | 'COMPETITIVE_FLEXIBLE' | 'RESTRICTED' | 'COMPETITIVE_DIALOGUE' | 'DIRECT_AWARD';
type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type Recommendation = 'Award' | 'Shortlist' | 'Reserve' | 'Reject';

interface ProcurementProject {
  id: string;
  name: string;
  description?: string;
  jurisdiction: Jurisdiction;
  status: ProjectStatus;
  estimatedValue?: number;
  currency?: Currency;
  route?: ProcurementRoute;
  basketId?: string;
  startDate?: string;
  stages?: ProjectStage[];
  createdAt: string;
}

interface ProjectTask {
  id: string;
  title: string;
  isMandatory: boolean;
  isCompleted: boolean;
}

interface Approval {
  id: string;
  label: string;
  status: ApprovalStatus;
  approver?: string;
}

interface ProjectStage {
  stageCode: string;
  stageName: string;
  stageOrder: number;
  status: StageStatus;
  minimumDays: number;
  isStatutory: boolean;
  startDate?: string;
  endDate?: string;
  tasks: ProjectTask[];
  approvals: Approval[];
}

interface ComplianceResult {
  passed: boolean;
  failures: string[];
}

interface TimelineStage {
  stageCode: string;
  stageName: string;
  stageOrder: number;
  minimumDays: number;
  isStatutory: boolean;
  startDate: string;
  endDate: string;
  status: StageStatus;
}

interface EvaluationEntry {
  id: string;
  systemId: string;
  systemName: string;
  frameworkScore?: number;
  technicalScore?: number;
  commercialScore?: number;
  implementationScore?: number;
  referenceScore?: number;
  overallScore?: number;
  recommendation?: Recommendation;
}

interface WeightingProfile {
  framework: number;
  technical: number;
  commercial: number;
  implementation: number;
  references: number;
}

interface CapabilityBasketItem {
  id: string;
  name: string;
  itemCount: number;
}

interface ShortlistedSystem {
  id: string;
  name: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const JURISDICTION_CONFIG: Record<Jurisdiction, {
  flag: string; label: string; legislation: string;
  threshold: string; standstill: string; tenderDays: number;
  noticeBoard: string; highlights: string[];
}> = {
  UK: {
    flag: '🇬🇧', label: 'UK', legislation: 'Procurement Act 2023',
    threshold: '£213,477 (goods/services)', standstill: '8 days', tenderDays: 25,
    noticeBoard: 'Find a Tender Service (FTS)',
    highlights: ['Competitive Flexible Procedure available', '8 working day standstill', 'Central digital platform mandatory'],
  },
  EU: {
    flag: '🇪🇺', label: 'European Union', legislation: 'Directive 2014/24/EU',
    threshold: '€221,000 (goods/services)', standstill: '10 days', tenderDays: 35,
    noticeBoard: 'Tenders Electronic Daily (TED)',
    highlights: ['ESPD self-declaration required', '10 calendar day standstill', 'Transparency Journal notice required'],
  },
  US_FEDERAL: {
    flag: '🇺🇸', label: 'US Federal', legislation: 'Federal Acquisition Regulation (FAR)',
    threshold: '$250,000 simplified acquisition', standstill: '5 days', tenderDays: 30,
    noticeBoard: 'SAM.gov',
    highlights: ['SAM.gov registration mandatory', 'Simplified acquisition <$250k', 'COTS preference in FAR 12'],
  },
  US_STATE: {
    flag: '🇺🇸', label: 'US State', legislation: 'State Procurement Code (varies)',
    threshold: 'Varies by state', standstill: 'Varies', tenderDays: 21,
    noticeBoard: 'State portal (varies)',
    highlights: ['State-specific thresholds', 'MWBE set-aside requirements may apply', 'Cooperative purchasing may be available'],
  },
  AU: {
    flag: '🇦🇺', label: 'Australia', legislation: 'Commonwealth Procurement Rules (CPRs)',
    threshold: 'AUD $80,000 (goods/services)', standstill: '10 days', tenderDays: 25,
    noticeBoard: 'AusTender',
    highlights: ['Value for money principle', 'Indigenous procurement policy', 'AusTender publication required'],
  },
};

const ROUTE_CONFIG: Record<ProcurementRoute, { label: string; description: string; whenToUse: string; jurisdictions: Jurisdiction[] }> = {
  OPEN: {
    label: 'Open Procedure', description: 'All interested suppliers may submit a full tender.',
    whenToUse: 'Best for straightforward procurements where requirements are clear.',
    jurisdictions: ['UK', 'EU', 'US_FEDERAL', 'US_STATE', 'AU'],
  },
  COMPETITIVE_FLEXIBLE: {
    label: 'Competitive Flexible Procedure', description: 'UK-specific flexible procedure allowing iterative engagement.',
    whenToUse: 'UK only. Best for complex or innovative requirements.',
    jurisdictions: ['UK'],
  },
  RESTRICTED: {
    label: 'Restricted Procedure', description: 'Pre-qualification stage narrows to a shortlist before tender.',
    whenToUse: 'Where supplier capability needs assessment before full tender.',
    jurisdictions: ['UK', 'EU'],
  },
  COMPETITIVE_DIALOGUE: {
    label: 'Competitive Dialogue', description: 'Dialogue with shortlisted bidders to develop solutions.',
    whenToUse: 'Complex procurements where requirements cannot be precisely specified upfront.',
    jurisdictions: ['UK', 'EU'],
  },
  DIRECT_AWARD: {
    label: 'Direct Award', description: 'Award without competition where permitted.',
    whenToUse: 'Below threshold, emergency, or framework call-off only.',
    jurisdictions: ['UK', 'EU', 'US_FEDERAL', 'US_STATE', 'AU'],
  },
};

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  GBP: '£', EUR: '€', USD: '$', AUD: 'A$',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatValue(value: number, currency: Currency = 'GBP'): string {
  return `${CURRENCY_SYMBOLS[currency]}${value.toLocaleString('en-GB')}`;
}

function stageStatusColour(status: StageStatus): string {
  switch (status) {
    case 'COMPLETED': return 'bg-emerald-500 border-emerald-600 text-white';
    case 'IN_PROGRESS': return 'bg-blue-500 border-blue-600 text-white';
    case 'AWAITING_APPROVAL': return 'bg-amber-500 border-amber-600 text-white';
    case 'BLOCKED': return 'bg-red-500 border-red-600 text-white';
    default: return 'bg-gray-200 border-gray-300 text-gray-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400';
  }
}

function projectStatusBadge(status: ProjectStatus): string {
  switch (status) {
    case 'active': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'awarded': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  }
}

function recommendationBadge(rec: Recommendation): string {
  switch (rec) {
    case 'Award': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'Shortlist': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'Reserve': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'Reject': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
  }
}

function calcOverall(entry: EvaluationEntry, weights: WeightingProfile): number {
  const h = ((entry.frameworkScore ?? 0) * weights.framework) / 100;
  const t = ((entry.technicalScore ?? 0) * weights.technical) / 100;
  const c = ((entry.commercialScore ?? 0) * weights.commercial) / 100;
  const i = ((entry.implementationScore ?? 0) * weights.implementation) / 100;
  const r = ((entry.referenceScore ?? 0) * weights.references) / 100;
  return Math.round(h + t + c + i + r);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StageProgressBar({ stages }: { stages: ProjectStage[] }) {
  const sorted = [...stages].sort((a, b) => a.stageOrder - b.stageOrder);
  return (
    <div className="flex items-center gap-0.5 mt-2">
      {sorted.map((s) => (
        <div
          key={s.stageCode}
          title={s.stageName}
          className={`h-1.5 flex-1 rounded-full ${
            s.status === 'COMPLETED' ? 'bg-emerald-500' :
            s.status === 'IN_PROGRESS' ? 'bg-blue-500' :
            s.status === 'BLOCKED' ? 'bg-red-400' :
            s.status === 'AWAITING_APPROVAL' ? 'bg-amber-400' :
            'bg-gray-200 dark:bg-gray-600'
          }`}
        />
      ))}
    </div>
  );
}

function PipelineView({
  project,
  onBack,
}: {
  project: ProcurementProject;
  onBack: () => void;
}) {
  const { t } = useTranslation("procurement");
  const qc = useQueryClient();
  const stages: ProjectStage[] = project.stages ?? [];
  const sorted = [...stages].sort((a, b) => a.stageOrder - b.stageOrder);
  const [selectedStage, setSelectedStage] = useState<ProjectStage | null>(sorted[0] ?? null);
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const taskMutation = useMutation({
    mutationFn: ({ stageId, taskId, completed }: { stageId: string; taskId: string; completed: boolean }) =>
      axios.patch<ApiResponse<unknown>>(
        `/api/procurement/v2/projects/${project.id}/stages/${stageId}/tasks/${taskId}`,
        { isCompleted: completed }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-v2-project', project.id] });
    },
  });

  const approvalMutation = useMutation({
    mutationFn: ({ stageId, approvalId, decision }: { stageId: string; approvalId: string; decision: 'approved' | 'rejected' }) =>
      axios.patch<ApiResponse<unknown>>(
        `/api/procurement/v2/projects/${project.id}/stages/${stageId}/approvals/${approvalId}`,
        { status: decision }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-v2-project', project.id] });
    },
  });

  const complianceMutation = useMutation({
    mutationFn: () =>
      axios.get<ApiResponse<ComplianceResult>>(`/api/procurement/v2/projects/${project.id}/compliance`)
        .then((r) => r.data.data),
    onSuccess: (data) => setComplianceResult(data),
  });

  const advanceMutation = useMutation({
    mutationFn: () =>
      axios.post<ApiResponse<unknown>>(`/api/procurement/v2/projects/${project.id}/advance`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-v2-project', project.id] });
      showToast(t("projects.stageAdvanced", "Stage advanced successfully"));
    },
  });

  const jConfig = JURISDICTION_CONFIG[project.jurisdiction];
  const nextStage = selectedStage
    ? sorted.find((s) => s.stageOrder === (selectedStage.stageOrder + 1))
    : null;

  const completedTasks = selectedStage?.tasks.filter((t) => t.isCompleted).length ?? 0;
  const totalTasks = selectedStage?.tasks.length ?? 0;

  return (
    <div className="space-y-4">
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-1"
          >
            <ChevronLeft className="w-4 h-4" /> {t("projects.backToProjects", "Back to Projects")}
          </button>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{project.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm">{jConfig.flag} {jConfig.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${projectStatusBadge(project.status)}`}>
              {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
            </span>
            {project.estimatedValue && project.currency && (
              <span className="text-sm text-gray-500">
                {formatValue(project.estimatedValue, project.currency)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Pipeline visual */}
      <Card className="overflow-x-auto">
        <div className="flex items-start gap-0 min-w-max pb-2">
          {sorted.map((stage, i) => (
            <div key={stage.stageCode} className="flex items-start gap-0">
              <button
                onClick={() => setSelectedStage(stage)}
                className={`flex flex-col items-center gap-1 transition-opacity ${
                  selectedStage?.stageCode === stage.stageCode ? 'opacity-100' : 'opacity-60 hover:opacity-90'
                }`}
              >
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-bold ${stageStatusColour(stage.status)}`}>
                  {stage.stageOrder}
                </div>
                <div className="text-xs text-center w-16 leading-tight text-gray-700 dark:text-gray-300">
                  {stage.stageName.split(' ').slice(0, 2).join(' ')}
                </div>
              </button>
              {i < sorted.length - 1 && (
                <div className={`mt-4 flex-shrink-0 h-0.5 w-6 ${
                  stage.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-gray-300 dark:bg-gray-600'
                }`} />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Stage detail */}
      {selectedStage && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Tasks */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">{t("projects.tasks", "Tasks")}</h3>
              <span className="text-xs text-gray-500">{completedTasks}/{totalTasks} complete</span>
            </div>
            <div className="space-y-2">
              {selectedStage.tasks.length === 0 && (
                <p className="text-xs text-gray-400">{t("projects.noTasks", "No tasks defined for this stage.")}</p>
              )}
              {selectedStage.tasks.map((task) => (
                <label key={task.id} className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={task.isCompleted}
                    onChange={(e) =>
                      taskMutation.mutate({
                        stageId: selectedStage.stageCode,
                        taskId: task.id,
                        completed: e.target.checked,
                      })
                    }
                    className="mt-0.5 accent-teal-600 cursor-pointer"
                  />
                  <span className={`text-sm flex-1 ${task.isCompleted ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {task.isMandatory && !task.isCompleted && (
                      <Lock className="w-3 h-3 inline mr-1 text-red-500" />
                    )}
                    {task.title}
                    {task.isMandatory && (
                      <span className="text-red-500 ml-0.5">*</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </Card>

          {/* Approvals & Compliance */}
          <Card>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t("projects.approvals", "Approvals")}</h3>
            <div className="space-y-2 mb-4">
              {selectedStage.approvals.length === 0 && (
                <p className="text-xs text-gray-400">{t("projects.noApprovals", "No approvals required for this stage.")}</p>
              )}
              {selectedStage.approvals.map((approval) => (
                <div key={approval.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{approval.label}</span>
                  {approval.status === 'approved' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                      Approved ✓
                    </span>
                  )}
                  {approval.status === 'rejected' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                      Rejected ✗
                    </span>
                  )}
                  {approval.status === 'pending' && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        Awaiting
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs py-0.5 px-1.5 h-auto text-emerald-700 hover:bg-emerald-50"
                        onClick={() => approvalMutation.mutate({ stageId: selectedStage.stageCode, approvalId: approval.id, decision: 'approved' })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs py-0.5 px-1.5 h-auto text-red-700 hover:bg-red-50"
                        onClick={() => approvalMutation.mutate({ stageId: selectedStage.stageCode, approvalId: approval.id, decision: 'rejected' })}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm text-gray-900 dark:text-white">{t("compliance.title", "Compliance Check")}</h4>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => complianceMutation.mutate()}
                  disabled={complianceMutation.isPending}
                >
                  {complianceMutation.isPending ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    'Run Check'
                  )}
                </Button>
              </div>
              {complianceResult && (
                <div className={`rounded-lg p-3 text-xs ${
                  complianceResult.passed
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                }`}>
                  {complianceResult.passed ? (
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{t("compliance.passed", "All compliance checks passed")}</span>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <XCircle className="w-3.5 h-3.5" />
                        <span className="font-medium">Compliance issues:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {complianceResult.failures.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Advance stage */}
      {selectedStage && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {nextStage
                  ? `Ready to advance from "${selectedStage.stageName}" to "${nextStage.stageName}"?`
                  : 'This is the final stage.'}
              </p>
              {complianceResult && !complianceResult.passed && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Resolve compliance issues before advancing.
                </p>
              )}
            </div>
            {nextStage && (
              <Button
                onClick={() => advanceMutation.mutate()}
                disabled={
                  advanceMutation.isPending ||
                  (complianceResult !== null && !complianceResult.passed)
                }
                className="flex items-center gap-2"
              >
                {t("projects.advanceTo", "Advance to")} {nextStage.stageName}
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function TimelineView({ projectId }: { projectId: string }) {
  const { t } = useTranslation("procurement");
  const [startDateOverride, setStartDateOverride] = useState('');

  const { data: timelineStages, isLoading } = useQuery({
    queryKey: ['procurement-v2-timeline', projectId],
    queryFn: () =>
      axios.get<ApiResponse<TimelineStage[]>>(`/api/procurement/v2/projects/${projectId}/timeline`)
        .then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <Card className="flex items-center justify-center min-h-32">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </Card>
    );
  }

  const stages = timelineStages ?? [];
  if (stages.length === 0) {
    return (
      <Card className="text-center py-8 text-gray-400">
        <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>{t("timeline.noData", "No timeline data available for this project.")}</p>
      </Card>
    );
  }

  const sorted = [...stages].sort((a, b) => a.stageOrder - b.stageOrder);

  // Calculate relative widths
  const totalDays = sorted.reduce((sum, s) => sum + s.minimumDays, 0);

  // Earliest award = last stage end date
  const lastStage = sorted[sorted.length - 1];
  const earliestAward = lastStage?.endDate
    ? new Date(lastStage.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">{t("timeline.title", "Project Timeline")}</h3>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 dark:text-gray-400">Start Date:</label>
            <input
              type="date"
              value={startDateOverride}
              onChange={(e) => setStartDateOverride(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Gantt bars */}
        <div className="space-y-3">
          {sorted.map((stage) => {
            const widthPct = totalDays > 0 ? (stage.minimumDays / totalDays) * 100 : 10;
            const offsetPct = totalDays > 0
              ? (sorted.slice(0, stage.stageOrder - 1).reduce((s, x) => s + x.minimumDays, 0) / totalDays) * 100
              : 0;
            return (
              <div key={stage.stageCode} className="flex items-center gap-3">
                <div className="w-40 text-xs text-right text-gray-600 dark:text-gray-400 truncate flex-shrink-0">
                  {stage.stageName}
                </div>
                <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded relative overflow-hidden">
                  <div
                    className={`absolute top-0 h-full rounded flex items-center px-2 text-xs font-medium text-white ${
                      stage.status === 'COMPLETED' ? 'bg-emerald-500' :
                      stage.isStatutory ? 'bg-amber-400' :
                      'bg-blue-500'
                    }`}
                    style={{
                      left: `${offsetPct}%`,
                      width: `${widthPct}%`,
                    }}
                  >
                    <span className="truncate">{stage.minimumDays}d</span>
                  </div>
                </div>
                <div className="w-24 text-xs text-gray-500 flex-shrink-0">
                  {stage.startDate
                    ? new Date(stage.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    : '—'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded bg-blue-500" />
            <span className="text-gray-600 dark:text-gray-400">{t("timeline.inProgressFuture", "In Progress / Future")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded bg-emerald-500" />
            <span className="text-gray-600 dark:text-gray-400">Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded bg-amber-400" />
            <span className="text-gray-600 dark:text-gray-400">{t("timeline.statutoryMinimum", "Statutory Minimum")}</span>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <Flag className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="text-xs text-gray-500">{t("timeline.earliestAwardDate", "Earliest Award Date")}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{earliestAward}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function EvaluationView({ projectId }: { projectId: string }) {
  const { t } = useTranslation("procurement");
  const qc = useQueryClient();
  const [weights, setWeights] = useState<WeightingProfile>({
    framework: 40, technical: 25, commercial: 20, implementation: 10, references: 5,
  });
  const [addSystemId, setAddSystemId] = useState('');

  const { data: evaluations, isLoading } = useQuery({
    queryKey: ['procurement-v2-evaluations', projectId],
    queryFn: () =>
      axios.get<ApiResponse<EvaluationEntry[]>>(`/api/procurement/v2/projects/${projectId}/evaluations`)
        .then((r) => r.data.data),
  });

  const { data: shortlistData } = useQuery({
    queryKey: ['procurement-v2-shortlist', projectId],
    queryFn: () =>
      axios.get<ApiResponse<ShortlistedSystem[]>>(`/api/procurement/v2/projects/${projectId}/shortlist`)
        .then((r) => r.data.data),
  });

  const addSystemMutation = useMutation({
    mutationFn: (systemId: string) =>
      axios.post<ApiResponse<unknown>>(`/api/procurement/v2/projects/${projectId}/evaluations`, { systemId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-v2-evaluations', projectId] });
      setAddSystemId('');
    },
  });

  const updateScoreMutation = useMutation({
    mutationFn: ({ entryId, field, value }: { entryId: string; field: string; value: number }) =>
      axios.patch<ApiResponse<unknown>>(`/api/procurement/v2/projects/${projectId}/evaluations/${entryId}`, { [field]: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-v2-evaluations', projectId] });
    },
  });

  const weightTotal = Object.values(weights).reduce((s, v) => s + v, 0);
  const entries: EvaluationEntry[] = evaluations ?? [];
  const shortlist: ShortlistedSystem[] = shortlistData ?? [];

  const entriesWithOverall = entries.map((e) => ({
    ...e,
    overallScore: calcOverall(e, weights),
  }));

  const sorted = [...entriesWithOverall].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
  const maxOverall = sorted[0]?.overallScore ?? 100;

  const WEIGHT_LABELS: [keyof WeightingProfile, string][] = [
    ['framework', 'HERM Capability Fit'],
    ['technical', 'Technical Evaluation'],
    ['commercial', 'Commercial/Price'],
    ['implementation', 'Implementation Risk'],
    ['references', 'Reference Sites'],
  ];

  const SCORE_FIELDS: [keyof EvaluationEntry, string][] = [
    ['frameworkScore', 'HERM'],
    ['technicalScore', 'Technical'],
    ['commercialScore', 'Commercial'],
    ['implementationScore', 'Implementation'],
    ['referenceScore', 'References'],
  ];

  return (
    <div className="space-y-4">
      {/* Weighting profile */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">{t("evaluation.weightingProfile", "Weighting Profile")}</h3>
          {weightTotal !== 100 && (
            <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Weights must sum to 100% (currently {weightTotal}%)
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {WEIGHT_LABELS.map(([key, label]) => (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-400">{label}</span>
                <span className="font-semibold text-gray-900 dark:text-white">{weights[key]}%</span>
              </div>
              <input
                type="range" min={0} max={100} step={5}
                value={weights[key]}
                onChange={(e) => setWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                className="w-full accent-teal-600"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Add system */}
      <Card>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t("evaluation.addSystemToEvaluation", "Add System to Evaluation")}</h3>
        <div className="flex items-center gap-2">
          <select
            value={addSystemId}
            onChange={(e) => setAddSystemId(e.target.value)}
            className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">Select from shortlisted systems…</option>
            {shortlist.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <Button
            onClick={() => addSystemId && addSystemMutation.mutate(addSystemId)}
            disabled={!addSystemId || addSystemMutation.isPending}
          >
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      </Card>

      {/* Evaluation table */}
      {isLoading ? (
        <Card className="flex items-center justify-center min-h-32">
          <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
        </Card>
      ) : entries.length === 0 ? (
        <Card className="text-center py-8 text-gray-400">
          <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>{t("evaluation.noSystems", "No systems added to evaluation yet.")}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">System</th>
                {SCORE_FIELDS.map(([, label]) => (
                  <th key={label} className="text-center px-3 py-3 font-medium text-gray-600 dark:text-gray-400">{label}</th>
                ))}
                <th className="text-center px-3 py-3 font-semibold text-gray-900 dark:text-white">Overall</th>
                <th className="text-center px-3 py-3 font-medium text-gray-600 dark:text-gray-400">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {entriesWithOverall.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{entry.systemName}</td>
                  {SCORE_FIELDS.map(([field]) => (
                    <td key={field} className="px-3 py-3 text-center">
                      <input
                        type="number"
                        min={0} max={100}
                        defaultValue={entry[field] as number ?? ''}
                        onBlur={(e) => {
                          const val = Math.min(100, Math.max(0, Number(e.target.value)));
                          updateScoreMutation.mutate({ entryId: entry.id, field: field as string, value: val });
                        }}
                        className="w-14 text-center text-sm border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center">
                    <span className="inline-block font-bold text-white bg-teal-600 rounded-full w-10 h-10 leading-10 text-sm">
                      {entry.overallScore}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {entry.recommendation ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${recommendationBadge(entry.recommendation)}`}>
                        {entry.recommendation}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Ranked bar chart */}
      {sorted.length > 0 && (
        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t("evaluation.overallScoreRanking", "Overall Score Ranking")}</h3>
          <div className="space-y-3">
            {sorted.map((entry, i) => (
              <div key={entry.id} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-5 text-right">{i + 1}</span>
                <span className="text-sm text-gray-700 dark:text-gray-300 w-40 truncate flex-shrink-0">{entry.systemName}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      entry.recommendation === 'Award' ? 'bg-emerald-500' :
                      entry.recommendation === 'Shortlist' ? 'bg-blue-500' :
                      entry.recommendation === 'Reserve' ? 'bg-amber-400' :
                      'bg-red-400'
                    }`}
                    style={{ width: `${maxOverall > 0 ? ((entry.overallScore ?? 0) / maxOverall) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-semibold w-8 text-right text-gray-900 dark:text-white">{entry.overallScore}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Wizard ────────────────────────────────────────────────────────────────────

interface WizardState {
  name: string;
  description: string;
  jurisdiction: Jurisdiction | '';
  estimatedValue: string;
  currency: Currency;
  route: ProcurementRoute | '';
  basketId: string;
  startDate: string;
}

function CreateProjectWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation("procurement");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardState>({
    name: '', description: '', jurisdiction: '', estimatedValue: '',
    currency: 'GBP', route: '', basketId: '', startDate: '',
  });

  const { data: baskets } = useQuery({
    queryKey: ['baskets'],
    queryFn: () =>
      axios.get<ApiResponse<CapabilityBasketItem[]>>('/api/baskets').then((r) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      axios.post<ApiResponse<{ id: string }>>('/api/procurement/v2/projects', data)
        .then((r) => r.data.data),
    onSuccess: (data) => onCreated(data.id),
  });

  const STEPS = ['Basics', 'Jurisdiction', 'Value & Route', 'Basket', 'Timeline'];

  const selectedJConfig = form.jurisdiction ? JURISDICTION_CONFIG[form.jurisdiction] : null;
  const availableRoutes = form.jurisdiction
    ? Object.entries(ROUTE_CONFIG).filter(([, cfg]) => cfg.jurisdictions.includes(form.jurisdiction as Jurisdiction))
    : Object.entries(ROUTE_CONFIG);

  const canAdvance = (): boolean => {
    if (step === 0) return form.name.trim().length > 0;
    if (step === 1) return form.jurisdiction !== '';
    return true;
  };

  const handleCreate = () => {
    createMutation.mutate({
      name: form.name,
      description: form.description,
      jurisdiction: form.jurisdiction,
      estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : undefined,
      currency: form.currency,
      route: form.route || undefined,
      basketId: form.basketId || undefined,
      startDate: form.startDate || undefined,
    });
  };

  return (
    <div>
      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                i === step ? 'bg-teal-600 text-white' :
                i < step ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 cursor-pointer' :
                'bg-gray-200 text-gray-400 dark:bg-gray-700'
              }`}
            >
              {i < step ? '✓' : i + 1}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`w-6 h-0.5 ${i < step ? 'bg-teal-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </div>
        ))}
        <span className="ml-2 text-sm text-gray-500">{STEPS[step]}</span>
      </div>

      {/* Step 0 — Basics */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. SIS Replacement 2026–28"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of this procurement…"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
            />
          </div>
        </div>
      )}

      {/* Step 1 — Jurisdiction */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Select the regulatory framework that governs this procurement.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(Object.entries(JURISDICTION_CONFIG) as [Jurisdiction, typeof JURISDICTION_CONFIG[Jurisdiction]][]).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setForm((f) => ({ ...f, jurisdiction: key }))}
                className={`text-left p-3 rounded-lg border-2 transition-colors ${
                  form.jurisdiction === key
                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{cfg.flag}</span>
                  <span className="font-medium text-gray-900 dark:text-white text-sm">{cfg.label}</span>
                </div>
                <p className="text-xs text-gray-500">{cfg.legislation}</p>
                <p className="text-xs text-gray-400 mt-0.5">Threshold: {cfg.threshold}</p>
              </button>
            ))}
          </div>
          {selectedJConfig && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs">
              <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">Key requirements</p>
              <ul className="space-y-0.5 text-blue-700 dark:text-blue-400">
                {selectedJConfig.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="mt-0.5">•</span><span>{h}</span>
                  </li>
                ))}
                <li className="flex items-start gap-1 mt-1">
                  <span className="mt-0.5">•</span>
                  <span>Standstill: {selectedJConfig.standstill} | Min tender: {selectedJConfig.tenderDays} days | Platform: {selectedJConfig.noticeBoard}</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Step 2 — Value & Route */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estimated Contract Value</label>
            <div className="flex gap-2">
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as Currency }))}
                className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {(['GBP', 'EUR', 'USD', 'AUD'] as Currency[]).map((c) => (
                  <option key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</option>
                ))}
              </select>
              <input
                type="number"
                value={form.estimatedValue}
                onChange={(e) => setForm((f) => ({ ...f, estimatedValue: e.target.value }))}
                placeholder="0"
                min={0}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            {form.estimatedValue && selectedJConfig && (
              <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg ${
                Number(form.estimatedValue) > 200000
                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                  : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
              }`}>
                {Number(form.estimatedValue) > 200000
                  ? `Above threshold for ${selectedJConfig.legislation} — full competition required`
                  : `Below threshold — simplified procedure may be available`}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Procurement Route</label>
            <div className="space-y-2">
              {availableRoutes.map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setForm((f) => ({ ...f, route: key as ProcurementRoute }))}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                    form.route === key
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium text-sm text-gray-900 dark:text-white">{cfg.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{cfg.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5 italic">{cfg.whenToUse}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — Basket */}
      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">Link a capability basket to drive your requirements. Optional — you can skip this step.</p>
          <select
            value={form.basketId}
            onChange={(e) => setForm((f) => ({ ...f, basketId: e.target.value }))}
            className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">No basket — skip this step</option>
            {(baskets ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.itemCount} items)</option>
            ))}
          </select>
          {form.basketId && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              Basket linked — evaluation criteria will be pre-populated from this basket.
            </p>
          )}
        </div>
      )}

      {/* Step 4 — Timeline */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Start Date</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          {form.startDate && form.jurisdiction && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Estimated Timeline Preview</p>
              <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex justify-between">
                  <span>Requirements Definition</span>
                  <span>{form.startDate}</span>
                </div>
                <div className="flex justify-between">
                  <span>Market Engagement</span>
                  <span>~2 weeks after start</span>
                </div>
                <div className="flex justify-between">
                  <span>Tender Period (min {selectedJConfig?.tenderDays ?? 25} days)</span>
                  <span>~6 weeks after start</span>
                </div>
                <div className="flex justify-between">
                  <span>Standstill Period (min {selectedJConfig?.standstill ?? '8 days'})</span>
                  <span>~18 weeks after start</span>
                </div>
                <div className="flex justify-between font-medium text-gray-700 dark:text-gray-300 border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
                  <span>Estimated Award</span>
                  <span>~20 weeks after start</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button variant="secondary" onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}>
          {step === 0 ? 'Cancel' : (
            <><ChevronLeft className="w-4 h-4 mr-1" />Back</>
          )}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance()}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending || !form.name.trim()}
          >
            {createMutation.isPending ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Creating…</>
            ) : 'Create Project'}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type ActiveTab = 'projects' | 'pipeline' | 'timeline' | 'evaluation';

export function ProcurementProjects() {
  const { t } = useTranslation("procurement");
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: projects, isLoading } = useQuery({
    queryKey: ['procurement-v2-projects'],
    queryFn: () =>
      axios.get<ApiResponse<ProcurementProject[]>>('/api/procurement/v2/projects')
        .then((r) => r.data.data),
  });

  const { data: selectedProjectRaw } = useQuery({
    queryKey: ['procurement-v2-project', selectedProjectId],
    queryFn: () =>
      axios.get<ApiResponse<ProcurementProject>>(`/api/procurement/v2/projects/${selectedProjectId}`)
        .then((r) => r.data.data),
    enabled: !!selectedProjectId,
  });

  const selectedProject = selectedProjectRaw ?? null;

  const handleViewPipeline = (id: string) => {
    setSelectedProjectId(id);
    setActiveTab('pipeline');
  };

  const handleCreated = (id: string) => {
    qc.invalidateQueries({ queryKey: ['procurement-v2-projects'] });
    setSelectedProjectId(id);
    setWizardOpen(false);
    setActiveTab('pipeline');
  };

  const TABS: { key: ActiveTab; label: string; icon: React.ReactNode; requiresProject: boolean }[] = [
    { key: 'projects', label: t("projects.tabProjects", "Projects"), icon: <Layers className="w-4 h-4" />, requiresProject: false },
    { key: 'pipeline', label: t("projects.tabPipeline", "Pipeline"), icon: <ChevronRight className="w-4 h-4" />, requiresProject: true },
    { key: 'timeline', label: t("projects.tabTimeline", "Timeline"), icon: <CalendarDays className="w-4 h-4" />, requiresProject: true },
    { key: 'evaluation', label: t("projects.tabEvaluation", "Evaluation"), icon: <BarChart2 className="w-4 h-4" />, requiresProject: true },
  ];

  return (
    <div>
      <Header
        title={t("projects.title", "Procurement Projects")}
        subtitle={t("projects.subtitle", "Manage end-to-end procurement projects across jurisdictions with full compliance tracking")}
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              if (tab.requiresProject && !selectedProjectId) return;
              setActiveTab(tab.key);
            }}
            disabled={tab.requiresProject && !selectedProjectId}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 -mb-px ${
              activeTab === tab.key
                ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                : tab.requiresProject && !selectedProjectId
                ? 'border-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'border-transparent text-gray-600 hover:text-teal-600 dark:text-gray-400 dark:hover:text-teal-300 hover:border-teal-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1 — Projects */}
      {activeTab === 'projects' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> {t("projects.createNewProject", "Create New Project")}
            </Button>
          </div>

          {isLoading && (
            <div className="flex justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}

          {!isLoading && (projects ?? []).length === 0 && (
            <Card className="text-center py-12">
              <Layers className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-600 dark:text-gray-400">{t("projects.noProjects", "No procurement projects yet")}</p>
              <p className="text-sm text-gray-400 mt-1 mb-4">{t("projects.createFirst", "Create your first project to get started.")}</p>
              <Button onClick={() => setWizardOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> {t("projects.createProject", "Create Project")}
              </Button>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(projects ?? []).map((project) => {
              const jCfg = JURISDICTION_CONFIG[project.jurisdiction];
              return (
                <Card key={project.id} className="hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white leading-tight pr-2">{project.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${projectStatusBadge(project.status)}`}>
                      {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm">{jCfg.flag}</span>
                    <span className="text-xs text-gray-500">{jCfg.label}</span>
                    {project.estimatedValue && project.currency && (
                      <>
                        <span className="text-gray-300 dark:text-gray-600">·</span>
                        <span className="text-xs text-gray-500">
                          {formatValue(project.estimatedValue, project.currency)}
                        </span>
                      </>
                    )}
                  </div>

                  {project.stages && project.stages.length > 0 && (
                    <StageProgressBar stages={project.stages} />
                  )}

                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3 w-full"
                    onClick={() => handleViewPipeline(project.id)}
                  >
                    {t("projects.viewPipeline", "View Pipeline")} <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2 — Pipeline */}
      {activeTab === 'pipeline' && selectedProject && (
        <PipelineView
          project={selectedProject}
          onBack={() => setActiveTab('projects')}
        />
      )}
      {activeTab === 'pipeline' && !selectedProject && (
        <Card className="text-center py-12 text-gray-400">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Loading project data…</p>
        </Card>
      )}

      {/* Tab 3 — Timeline */}
      {activeTab === 'timeline' && selectedProjectId && (
        <TimelineView projectId={selectedProjectId} />
      )}

      {/* Tab 4 — Evaluation */}
      {activeTab === 'evaluation' && selectedProjectId && (
        <EvaluationView projectId={selectedProjectId} />
      )}

      {/* Create wizard modal */}
      <Modal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title={t("projects.createProcurementProject", "Create Procurement Project")}
      >
        <CreateProjectWizard
          onClose={() => setWizardOpen(false)}
          onCreated={handleCreated}
        />
      </Modal>
    </div>
  );
}
