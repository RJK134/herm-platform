import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Users, Plus, Calendar, CheckCircle, AlertTriangle,
  BarChart2, ChevronDown, ChevronRight, Award, FileText,
  ShieldCheck, Lock,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Header } from '../components/layout/Header';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type CoiDeclaration } from '../lib/api';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface EvaluationProject {
  id: string;
  name: string;
  description?: string;
  status: 'planning' | 'in_progress' | 'completed' | 'archived';
  leadUserId: string;
  basketId?: string;
  deadline?: string;
  createdAt: string;
  systems: Array<{ id: string; systemId: string; system: { id: string; name: string; vendor: string } }>;
  members: Array<{
    id: string;
    userId: string;
    role: string;
    user: { id: string; name: string; email: string };
    assignedDomains: string[];
  }>;
  domainAssignments: Array<{
    id: string;
    domainId: string;
    domain: { code: string; name: string };
    assignedToId: string;
    assignedTo: { name: string; email: string };
    status: string;
    completedAt?: string;
  }>;
}

interface TeamMemberProgress {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  domainsAssigned: number;
  domainsCompleted: number;
  averageScore: number;
  completionPct: number;
}

interface ProgressResponse {
  project: { id: string; name: string; status: string };
  members: TeamMemberProgress[];
  summary: { totalDomains: number; completedDomains: number; overallCompletion: number };
}

interface AggregatedSystem {
  systemId: string;
  systemName: string;
  systemVendor: string;
  overallScore: number;
  maxScore: number;
  percentage: number;
  rank: number;
  variance: number;
  highVariance: boolean;
  domainScores: Array<{ domainCode: string; domainName: string; avgScore: number; evaluatorCount: number }>;
}

interface AggregateResponse {
  project: { id: string; name: string };
  systems: AggregatedSystem[];
}

interface SystemOption {
  id: string;
  name: string;
  vendor: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TABS = [
  'Projects',
  'Domain Assignment',
  'Conflict of Interest',
  'Team Progress',
  'Score Aggregation',
] as const;
type Tab = typeof TABS[number];

const STATUS_COLOURS: Record<string, string> = {
  planning: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  archived: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  NOT_STARTED: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function completionPct(project: EvaluationProject): number {
  const total = project.domainAssignments.length;
  if (total === 0) return 0;
  const done = project.domainAssignments.filter(d => d.status === 'COMPLETED').length;
  return Math.round((done / total) * 100);
}

// ── New Project Modal ─────────────────────────────────────────────────────────

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const { t } = useTranslation('common');
  const systemsQuery = useQuery<SystemOption[]>({
    queryKey: ['systems-simple'],
    queryFn: () =>
      axios.get<{ success: boolean; data: SystemOption[] }>('/api/systems?limit=50')
        .then(r => r.data.data),
    enabled: open,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);
  const [memberEmails, setMemberEmails] = useState('');
  const [basketId, setBasketId] = useState('');
  const [deadline, setDeadline] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      axios.post('/api/evaluations', {
        name,
        description: description || undefined,
        systemIds: selectedSystems,
        memberEmails: memberEmails.split(',').map(e => e.trim()).filter(Boolean),
        basketId: basketId || undefined,
        deadline: deadline || undefined,
      }),
    onSuccess: () => { onCreated(); onClose(); resetForm(); },
  });

  const resetForm = () => {
    setName(''); setDescription(''); setSelectedSystems([]); setMemberEmails(''); setBasketId(''); setDeadline('');
  };

  const toggleSystem = (id: string) =>
    setSelectedSystems(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  return (
    <Modal open={open} onClose={onClose} title={t("workspaces.newProjectTitle", "New Evaluation Project")}>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("workspaces.projectName", "Project Name")} <span className="text-red-500">*</span></label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            placeholder="e.g. SIS Replacement Evaluation 2025"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("workspaces.systemsToEvaluate", "Systems to Evaluate")}</label>
          <div className="border border-gray-200 dark:border-gray-600 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
            {systemsQuery.data?.map(sys => (
              <label key={sys.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSystems.includes(sys.id)}
                  onChange={() => toggleSystem(sys.id)}
                  className="rounded text-teal-600"
                />
                <span className="text-sm dark:text-white">{sys.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{sys.vendor}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("workspaces.teamMemberEmails", "Team Member Emails")}</label>
          <input
            value={memberEmails}
            onChange={e => setMemberEmails(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            placeholder="alice@uni.ac.uk, bob@uni.ac.uk"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t("workspaces.commaSeparated", "Comma-separated")}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("workspaces.basketLink", "Basket Link (optional)")}</label>
            <input
              value={basketId}
              onChange={e => setBasketId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              placeholder="Basket ID"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("workspaces.deadline", "Deadline (optional)")}</label>
            <input
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>{t("workspaces.cancel", "Cancel")}</Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name || selectedSystems.length === 0}
          >
            {createMutation.isPending ? t("workspaces.creating", "Creating…") : t("workspaces.createProject", "Create Project")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function TeamWorkspaces() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('Projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const projectsQuery = useQuery<EvaluationProject[]>({
    queryKey: ['evaluations'],
    queryFn: () =>
      axios.get<{ success: boolean; data: EvaluationProject[] }>('/api/evaluations')
        .then(r => r.data.data),
  });

  const projectDetailQuery = useQuery<EvaluationProject>({
    queryKey: ['evaluation', selectedProjectId],
    queryFn: () =>
      axios.get<{ success: boolean; data: EvaluationProject }>(`/api/evaluations/${selectedProjectId}`)
        .then(r => r.data.data),
    enabled: !!selectedProjectId && (activeTab === 'Domain Assignment'),
  });

  const progressQuery = useQuery<ProgressResponse>({
    queryKey: ['evaluation-progress', selectedProjectId],
    queryFn: () =>
      axios.get<{ success: boolean; data: ProgressResponse }>(`/api/evaluations/${selectedProjectId}/progress`)
        .then(r => r.data.data),
    enabled: !!selectedProjectId && activeTab === 'Team Progress',
  });

  const aggregateQuery = useQuery<AggregateResponse>({
    queryKey: ['evaluation-aggregate', selectedProjectId],
    queryFn: () =>
      axios.get<{ success: boolean; data: AggregateResponse }>(`/api/evaluations/${selectedProjectId}/aggregate`)
        .then(r => r.data.data),
    enabled: !!selectedProjectId && activeTab === 'Score Aggregation',
  });

  // Phase 14.9b — CoI declaration query feeds two consumers:
  //   1. The Conflict of Interest tab (which lets the evaluator submit/revise)
  //   2. The Domain Assignment scoring gate (which blocks "Enter Scores" until a
  //      declaration exists, so PA 2023 ss.81-83 audit trail is non-bypassable)
  // Loaded whenever a project is selected so the gate can render the right
  // affordance even if the user lands directly on Domain Assignment.
  const coiQuery = useQuery<CoiDeclaration | null>({
    queryKey: ['evaluation-coi', selectedProjectId],
    queryFn: () =>
      api.getMyCoi(selectedProjectId as string).then(r => r.data.data ?? null),
    enabled: !!selectedProjectId,
  });

  const markCompleteMutation = useMutation({
    mutationFn: () =>
      axios.patch(`/api/evaluations/${selectedProjectId}`, { status: 'completed' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluations'] });
      qc.invalidateQueries({ queryKey: ['evaluation-progress', selectedProjectId] });
    },
  });

  const finalise = useMutation({
    mutationFn: () =>
      axios.patch(`/api/evaluations/${selectedProjectId}`, { status: 'completed' }),
    onSuccess: () => navigate('/documents'),
  });

  const autoAssignMutation = useMutation({
    mutationFn: () =>
      axios.post(`/api/evaluations/${selectedProjectId}/domains/auto-assign`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evaluation', selectedProjectId] }),
  });

  const assignDomainMutation = useMutation({
    mutationFn: ({ domainId, userId }: { domainId: string; userId: string }) =>
      axios.post(`/api/evaluations/${selectedProjectId}/domains/assign`, { domainId, userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evaluation', selectedProjectId] }),
  });

  const projects = projectsQuery.data ?? [];
  const selectedProject = projectDetailQuery.data;
  const progress = progressQuery.data;
  const aggregate = aggregateQuery.data;

  const openProject = (id: string) => {
    setSelectedProjectId(id);
    setActiveTab('Domain Assignment');
  };

  return (
    <div className="space-y-6">
      <Header
        title={t("workspaces.title", "Team Evaluation Workspaces")}
        subtitle={t("workspaces.subtitle", "Collaborate on structured HERM capability evaluations with your team")}
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === t
                ? 'bg-teal-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab: Projects ──────────────────────────────────────────── */}
      {activeTab === 'Projects' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-2"
              onClick={() => setShowNewModal(true)}
            >
              <Plus className="w-4 h-4" /> {t("workspaces.newProject", "New Evaluation Project")}
            </Button>
          </div>

          {projects.length === 0 && !projectsQuery.isPending && (
            <Card className="text-center py-12">
              <Users className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">{t("workspaces.noProjects", "No evaluation projects yet. Create one to get started.")}</p>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map(proj => (
              <div
                key={proj.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 cursor-pointer hover:border-teal-400 dark:hover:border-teal-600 transition-colors"
                onClick={() => openProject(proj.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold dark:text-white text-sm leading-tight">{proj.name}</h3>
                  <StatusBadge status={proj.status} />
                </div>
                {proj.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{proj.description}</p>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {proj.members.length} {t("workspaces.members", "members")}</span>
                  <span className="flex items-center gap-1"><BarChart2 className="w-3.5 h-3.5" /> {proj.systems.length} {t("workspaces.systems", "systems")}</span>
                  {proj.deadline && (
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(proj.deadline).toLocaleDateString('en-GB')}</span>
                  )}
                </div>
                <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
                  <div
                    className="h-full bg-teal-500 rounded-full"
                    style={{ width: `${completionPct(proj)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{completionPct(proj)}% {t("workspaces.complete", "complete")}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Domain Assignment ─────────────────────────────────── */}
      {activeTab === 'Domain Assignment' && (
        <div>
          {!selectedProjectId ? (
            <Card className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Select a project from the Projects tab to manage domain assignments.</p>
            </Card>
          ) : !selectedProject ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p>
          ) : (
            <DomainAssignmentPanel
              project={selectedProject}
              coi={coiQuery.data ?? null}
              coiLoading={coiQuery.isPending}
              onGoToCoi={() => setActiveTab('Conflict of Interest')}
              onAutoAssign={() => autoAssignMutation.mutate()}
              onAssign={(domainId, userId) => assignDomainMutation.mutate({ domainId, userId })}
            />
          )}
        </div>
      )}

      {/* ── Tab: Conflict of Interest ─────────────────────────────── */}
      {activeTab === 'Conflict of Interest' && (
        <div>
          {!selectedProjectId ? (
            <Card className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Select a project from the Projects tab to manage your CoI declaration.</p>
            </Card>
          ) : (
            <CoiPanel
              projectId={selectedProjectId}
              coi={coiQuery.data ?? null}
              loading={coiQuery.isPending}
            />
          )}
        </div>
      )}

      {/* ── Tab: Team Progress ────────────────────────────────────── */}
      {activeTab === 'Team Progress' && (
        <div>
          {!selectedProjectId ? (
            <Card className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Select a project from the Projects tab to view progress.</p>
            </Card>
          ) : !progress ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p>
          ) : (
            <ProgressPanel
              progress={progress}
              onMarkComplete={() => markCompleteMutation.mutate()}
              isPending={markCompleteMutation.isPending}
            />
          )}
        </div>
      )}

      {/* ── Tab: Score Aggregation ─────────────────────────────────── */}
      {activeTab === 'Score Aggregation' && (
        <div>
          {!selectedProjectId ? (
            <Card className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Select a project from the Projects tab to view aggregated scores.</p>
            </Card>
          ) : !aggregate ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p>
          ) : (
            <AggregationPanel
              aggregate={aggregate}
              onFinalise={() => finalise.mutate()}
              isPending={finalise.isPending}
            />
          )}
        </div>
      )}

      <NewProjectModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ['evaluations'] })}
      />
    </div>
  );
}

// ── Domain Assignment Panel ───────────────────────────────────────────────────

interface DomainAssignmentPanelProps {
  project: EvaluationProject;
  coi: CoiDeclaration | null;
  coiLoading: boolean;
  onGoToCoi: () => void;
  onAutoAssign: () => void;
  onAssign: (domainId: string, userId: string) => void;
}

function DomainAssignmentPanel({
  project,
  coi,
  coiLoading,
  onGoToCoi,
  onAutoAssign,
  onAssign,
}: DomainAssignmentPanelProps) {
  const evaluators = project.members.filter(m => m.role === 'evaluator' || m.role === 'EVALUATOR' || true);
  const scoringGated = !coi && !coiLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold dark:text-white">{project.name} — Domain Assignments</h2>
        <Button
          variant="secondary"
          className="flex items-center gap-2"
          onClick={onAutoAssign}
        >
          <Users className="w-4 h-4" /> Auto-assign
        </Button>
      </div>

      {scoringGated && (
        <div
          id="coi-gate-banner"
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-6"
        >
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Conflict of Interest declaration required
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                UK Procurement Act 2023 (ss.81-83) requires every evaluator to record a CoI declaration
                before scoring. Score entry is disabled until you submit yours.
              </p>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white mt-3"
                onClick={onGoToCoi}
              >
                Declare now
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <th className="px-4 py-3 font-medium">Domain</th>
              <th className="px-4 py-3 font-medium">Assigned To</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {project.domainAssignments.map(da => (
              <tr key={da.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="px-4 py-3 font-medium dark:text-white">
                  {da.domain.code} — {da.domain.name}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={da.assignedToId}
                    onChange={e => onAssign(da.domainId, e.target.value)}
                    className="text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  >
                    <option value="">Unassigned</option>
                    {evaluators.map(m => (
                      <option key={m.id} value={m.userId}>{m.user.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3"><StatusBadge status={da.status} /></td>
                <td className="px-4 py-3">
                  {da.status === 'IN_PROGRESS' && (
                    // The disabled <Button> uses `pointer-events-none` so a
                    // `title` on it is silently dropped. The amber gate banner
                    // above the table is the canonical explanation; the
                    // `aria-describedby` link makes the relationship explicit
                    // for screen readers when the button is disabled.
                    <Button
                      size="sm"
                      className="bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={scoringGated}
                      aria-describedby={scoringGated ? 'coi-gate-banner' : undefined}
                    >
                      Enter Scores
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ── Conflict of Interest Panel ─────────────────────────────────────────────
// Phase 14.9b — UK Procurement Act 2023 (ss.81-83) audit-trail entry. Each
// evaluator declares (or confirms "no conflicts") before they may score.
// First-pass UI: textarea + submit. Existing declarations are displayed
// with signed-at timestamp; "Revise" re-opens the textarea and re-submits
// (server upserts and re-stamps signedAt).

interface CoiPanelProps {
  projectId: string;
  coi: CoiDeclaration | null;
  loading: boolean;
}

function CoiPanel({ projectId, coi, loading }: CoiPanelProps) {
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: () => api.submitCoi(projectId, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluation-coi', projectId] });
      setEditing(false);
      setText('');
      setError(null);
    },
    onError: (err: unknown) => {
      // `api.submitCoi` goes through the shared axios `client` whose
      // response interceptor rejects with `ApiError` (server-provided
      // message + code), not raw AxiosError. Surface that message
      // directly when present so the user sees the real validation
      // failure rather than the generic fallback.
      if (err instanceof ApiError) {
        setError(err.message);
        return;
      }
      setError('Could not save the declaration. Please try again.');
    },
  });

  if (loading) {
    return <p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p>;
  }

  const existing = coi;
  const showForm = editing || !existing;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        <div>
          <h2 className="font-bold dark:text-white">Conflict of Interest declaration</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Required before you may score systems on this evaluation (PA 2023 ss.81-83).
          </p>
        </div>
      </div>

      {existing && !editing && (
        <Card>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-400 font-semibold">
                Declaration recorded
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Signed {new Date(existing.signedAt).toLocaleString('en-GB')}
              </p>
              {existing.declaredText.trim() === '' ? (
                <p className="text-sm dark:text-white mt-3 italic text-gray-600 dark:text-gray-400">
                  No conflicts declared.
                </p>
              ) : (
                <p className="text-sm dark:text-white mt-3 whitespace-pre-wrap">
                  {existing.declaredText}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setText(existing.declaredText);
                setEditing(true);
                setError(null);
              }}
            >
              Revise declaration
            </Button>
          </div>
        </Card>
      )}

      {showForm && (
        <Card>
          <label htmlFor="coi-declared-text" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Declared interests
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Disclose any commercial, professional, personal, or financial interest you hold in any
            vendor under evaluation. Leave blank if you have nothing to declare.
          </p>
          <textarea
            id="coi-declared-text"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-y"
            placeholder="e.g. I previously consulted for Vendor X (2021-2022). My spouse is employed by Vendor Y."
          />
          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            {editing && existing && (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(false);
                  setText('');
                  setError(null);
                }}
              >
                Cancel
              </Button>
            )}
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? 'Submitting…' : existing ? 'Save revision' : 'Submit declaration'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Progress Panel ────────────────────────────────────────────────────────────

interface ProgressPanelProps {
  progress: ProgressResponse;
  onMarkComplete: () => void;
  isPending: boolean;
}

function ProgressPanel({ progress, onMarkComplete, isPending }: ProgressPanelProps) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Domains', value: progress.summary.totalDomains },
          { label: 'Completed', value: progress.summary.completedDomains },
          { label: 'Overall Completion', value: `${progress.summary.overallCompletion}%` },
          { label: 'Team Members', value: progress.members.length },
        ].map(({ label, value }) => (
          <Card key={label} className="p-4 text-center">
            <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">{value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
          </Card>
        ))}
      </div>

      {/* Member cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {progress.members.map(member => (
          <Card key={member.memberId} className="p-5">
            <div className="flex items-center gap-3 mb-3">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold dark:text-white text-sm">{member.name}</p>
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">{member.role}</span>
              </div>
              {/* Circular progress */}
              <div className="ml-auto flex-shrink-0">
                <CircularProgress pct={member.completionPct} />
              </div>
            </div>
            <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
              <div className="flex justify-between">
                <span>Domains</span>
                <span className="font-medium dark:text-white">{member.domainsCompleted}/{member.domainsAssigned}</span>
              </div>
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
                <div
                  className="h-full bg-teal-500 rounded-full"
                  style={{ width: `${member.domainsAssigned > 0 ? (member.domainsCompleted / member.domainsAssigned) * 100 : 0}%` }}
                />
              </div>
              <div className="flex justify-between">
                <span>Avg Score</span>
                <span className="font-medium dark:text-white">{member.averageScore.toFixed(0)}%</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
          onClick={onMarkComplete}
          disabled={isPending}
        >
          <CheckCircle className="w-4 h-4" />
          {isPending ? 'Updating…' : 'Mark Project Complete'}
        </Button>
      </div>
    </div>
  );
}

// ── Circular Progress ─────────────────────────────────────────────────────────

function CircularProgress({ pct }: { pct: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-200 dark:text-gray-700" />
      <circle
        cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="3"
        className="text-teal-500"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
      />
      <text x="22" y="26" textAnchor="middle" fontSize="9" className="fill-gray-700 dark:fill-gray-300" fontWeight="bold">
        {pct}%
      </text>
    </svg>
  );
}

// ── Aggregation Panel ─────────────────────────────────────────────────────────

interface AggregationPanelProps {
  aggregate: AggregateResponse;
  onFinalise: () => void;
  isPending: boolean;
}

function AggregationPanel({ aggregate, onFinalise, isPending }: AggregationPanelProps) {
  const [openSystem, setOpenSystem] = useState<string | null>(null);
  const sorted = [...aggregate.systems].sort((a, b) => a.rank - b.rank);

  const rankColour = (rank: number) => {
    if (rank === 1) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300';
    if (rank === 2) return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    if (rank === 3) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
    return 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
  };

  const rankLabel = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  return (
    <div className="space-y-6">
      {/* System cards */}
      <div className="space-y-3">
        {sorted.map(sys => (
          <Card key={sys.systemId} className="p-0 overflow-hidden">
            <button
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors text-left"
              onClick={() => setOpenSystem(openSystem === sys.systemId ? null : sys.systemId)}
            >
              <span className={`px-2 py-1 rounded-lg text-sm font-bold flex-shrink-0 ${rankColour(sys.rank)}`}>
                {rankLabel(sys.rank)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold dark:text-white text-sm">{sys.systemName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{sys.systemVendor}</p>
              </div>
              <div className="flex items-center gap-3">
                {sys.highVariance && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 flex-shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5" /> Evaluators disagree
                  </span>
                )}
                <span className="text-lg font-bold text-teal-600 dark:text-teal-400">{sys.percentage.toFixed(1)}%</span>
                {openSystem === sys.systemId ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              </div>
            </button>
            {openSystem === sys.systemId && (
              <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 space-y-2">
                {sys.domainScores.map(fs => {
                  const maxDomainScore = 100;
                  const pct = Math.min(fs.avgScore, maxDomainScore);
                  return (
                    <div key={fs.domainCode} className="flex items-center gap-3">
                      <span className="text-xs w-28 text-gray-500 dark:text-gray-400 truncate">{fs.domainCode}</span>
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                        <div
                          className="h-full bg-teal-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 dark:text-gray-400 w-10 text-right">{fs.avgScore.toFixed(0)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Final ranking table */}
      <Card>
        <h3 className="font-semibold dark:text-white text-sm mb-3 flex items-center gap-2">
          <Award className="w-4 h-4 text-teal-600 dark:text-teal-400" /> Final Rankings
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="pb-2 font-medium">Rank</th>
              <th className="pb-2 font-medium">System</th>
              <th className="pb-2 font-medium">Overall</th>
              <th className="pb-2 font-medium">Consensus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sorted.map(sys => (
              <tr key={sys.systemId}>
                <td className="py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${rankColour(sys.rank)}`}>
                    {rankLabel(sys.rank)}
                  </span>
                </td>
                <td className="py-2 font-medium dark:text-white">{sys.systemName}</td>
                <td className="py-2 font-bold text-teal-600 dark:text-teal-400">{sys.percentage.toFixed(1)}%</td>
                <td className="py-2">
                  {sys.highVariance ? (
                    <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> High variance
                    </span>
                  ) : sys.variance > 20 ? (
                    <span className="text-xs text-blue-600 dark:text-blue-400">Medium</span>
                  ) : (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Low variance
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex justify-end">
        <Button
          className="bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-2"
          onClick={onFinalise}
          disabled={isPending}
        >
          <FileText className="w-4 h-4" />
          {isPending ? 'Finalising…' : 'Finalise & Generate Report'}
        </Button>
      </div>
    </div>
  );
}
