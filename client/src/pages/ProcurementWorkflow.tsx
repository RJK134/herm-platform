import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { api } from '../lib/api';
import { CheckCircle, Circle, Clock, ChevronRight, Plus } from 'lucide-react';

const STAGE_DESCRIPTIONS = [
  {
    number: 1,
    title: 'Requirements Definition',
    desc: 'Define institutional requirements using HERM Capability Basket. Agree must/should/could priorities with stakeholders.',
    outputs: [
      'Capability Basket created',
      'MoSCoW priorities agreed',
      'Evaluation criteria weighted',
    ],
  },
  {
    number: 2,
    title: 'Market Engagement',
    desc: 'Review HERM leaderboard, vendor profiles, and research hub. Issue RFI or hold soft market testing.',
    outputs: [
      'Market scan complete',
      'Long list of potential vendors identified',
      'RFI issued (optional)',
    ],
  },
  {
    number: 3,
    title: 'Long List',
    desc: 'Evaluate all viable systems against HERM basket requirements. Agree a long list (typically 6-8 systems).',
    outputs: [
      'HERM basket evaluation complete',
      'Long list agreed (6-8 systems)',
      'TCO estimates prepared',
    ],
  },
  {
    number: 4,
    title: 'Short List',
    desc: 'Assess long list against additional criteria (TCO, risk, references). Agree short list for ITT (typically 3-4 systems).',
    outputs: [
      'Short list agreed (3-4 systems)',
      'Reference site visits completed',
      'Senior stakeholder sign-off',
    ],
  },
  {
    number: 5,
    title: 'ITT / RFP Issuance',
    desc: 'Issue formal Invitation to Tender. Vendors respond to detailed functional and technical requirements.',
    outputs: [
      'ITT document published',
      'Vendors invited to respond',
      'Clarification period complete',
    ],
  },
  {
    number: 6,
    title: 'Evaluation & Scoring',
    desc: 'Score vendor responses against HERM requirements. Conduct demonstrations and reference checks.',
    outputs: [
      'Tender responses evaluated',
      'Demonstrations completed',
      'Evaluation report produced',
    ],
  },
  {
    number: 7,
    title: 'Preferred Supplier',
    desc: 'Identify preferred supplier. Negotiate commercial terms. Conduct due diligence.',
    outputs: [
      'Preferred supplier identified',
      'Commercial negotiation complete',
      'Due diligence satisfactory',
    ],
  },
  {
    number: 8,
    title: 'Contract Award',
    desc: 'Award contract and announce decision. Begin mobilisation planning.',
    outputs: [
      'Contract awarded',
      'Unsuccessful vendors notified',
      'Implementation mobilisation begins',
    ],
  },
] as const;

interface ProjectListItem {
  id: string;
  name: string;
  status: string;
  workflow?: { currentStage: number } | null;
}

interface WorkflowStageData {
  stageNumber: number;
  status: string;
  completedAt?: string | null;
  notes?: string | null;
}

interface WorkflowData {
  currentStage: number;
  stages: WorkflowStageData[];
}

interface ProjectDetail {
  id: string;
  name: string;
  status: string;
  workflow?: WorkflowData | null;
}

export function ProcurementWorkflow() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingStage, setEditingStage] = useState<number | null>(null);
  const [stageNotes, setStageNotes] = useState('');

  const { data: projects } = useQuery({
    queryKey: ['procurement-projects'],
    queryFn: () => api.listProjects().then((r) => r.data.data),
  });

  const { data: project } = useQuery({
    queryKey: ['procurement-project', selectedProjectId],
    queryFn: () => api.getProject(selectedProjectId!).then((r) => r.data.data),
    enabled: !!selectedProjectId,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createProject({ name }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['procurement-projects'] });
      const created = res.data.data as { id: string };
      setSelectedProjectId(created.id);
      setShowCreate(false);
      setNewProjectName('');
    },
  });

  const advanceMutation = useMutation({
    mutationFn: (projectId: string) => api.advanceWorkflow(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-project', selectedProjectId] });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: ({ stageNum, notes }: { stageNum: number; notes: string }) =>
      api.updateWorkflowStage(selectedProjectId!, stageNum, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-project', selectedProjectId] });
      setEditingStage(null);
    },
  });

  const typedProject = project as ProjectDetail | undefined;
  const workflow = typedProject?.workflow;
  const stages = workflow?.stages ?? [];
  const currentStage = workflow?.currentStage ?? 1;

  const getStageData = (num: number): WorkflowStageData | undefined =>
    stages.find((s) => s.stageNumber === num);

  return (
    <div>
      <Header
        title="Procurement Workflow"
        subtitle="Manage the 8-stage HE procurement process from requirements to contract award"
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Project list sidebar */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
              Projects
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="w-3 h-3 mr-1" />
              New
            </Button>
          </div>
          <div className="space-y-2">
            {((projects as ProjectListItem[] | undefined) ?? []).map(
              (p: ProjectListItem) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    selectedProjectId === p.id
                      ? 'bg-teal/20 text-teal font-medium border border-teal/30'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-gray-400 capitalize flex items-center gap-1 mt-0.5">
                    <span>{p.status}</span>
                    {p.workflow && (
                      <span>· Stage {p.workflow.currentStage}/8</span>
                    )}
                  </div>
                </button>
              )
            )}
            {((projects as unknown[]) ?? []).length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">
                No projects yet
              </p>
            )}
          </div>
        </div>

        {/* Workflow detail */}
        <div className="lg:col-span-3">
          {!selectedProjectId && (
            <Card className="flex items-center justify-center min-h-64 text-gray-400">
              <div className="text-center">
                <div className="text-4xl mb-3">&#x1F4CB;</div>
                <p className="font-medium">
                  Select or create a procurement project
                </p>
                <Button className="mt-4" onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Project
                </Button>
              </div>
            </Card>
          )}

          {selectedProjectId && workflow && (
            <>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="font-heading font-bold text-gray-900 dark:text-white">
                    {typedProject?.name}
                  </h2>
                  <p className="text-sm text-gray-500">
                    Stage {currentStage} of 8 &middot;{' '}
                    {STAGE_DESCRIPTIONS[currentStage - 1]?.title}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    advanceMutation.mutate(selectedProjectId)
                  }
                  disabled={
                    currentStage >= 8 || advanceMutation.isPending
                  }
                >
                  {currentStage < 8
                    ? `Advance to Stage ${currentStage + 1}`
                    : 'Complete'}
                  {currentStage < 8 && (
                    <ChevronRight className="w-4 h-4 ml-1" />
                  )}
                </Button>
              </div>

              {/* Progress bar */}
              <div className="flex gap-1 mb-6">
                {Array.from({ length: 8 }, (_, i) => {
                  const stageData = getStageData(i + 1);
                  const status = stageData?.status ?? 'pending';
                  return (
                    <div
                      key={i}
                      className={`flex-1 h-2 rounded-full transition-colors ${
                        status === 'complete'
                          ? 'bg-green-500'
                          : status === 'active'
                          ? 'bg-teal'
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                      title={`Stage ${i + 1}: ${STAGE_DESCRIPTIONS[i]?.title}`}
                    />
                  );
                })}
              </div>

              {/* Stage cards */}
              <div className="space-y-3">
                {STAGE_DESCRIPTIONS.map((stageDef) => {
                  const stageData = getStageData(stageDef.number);
                  const status = stageData?.status ?? 'pending';
                  const isActive = status === 'active';
                  const isComplete = status === 'complete';

                  return (
                    <Card
                      key={stageDef.number}
                      className={`transition-all ${
                        isActive
                          ? 'border-teal border-2'
                          : isComplete
                          ? 'opacity-80'
                          : 'opacity-60'
                      }`}
                    >
                      <div className="flex gap-4">
                        <div className="flex-shrink-0 mt-0.5">
                          {isComplete ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : isActive ? (
                            <Clock className="w-5 h-5 text-teal" />
                          ) : (
                            <Circle className="w-5 h-5 text-gray-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs text-gray-400 font-medium">
                                Stage {stageDef.number}
                              </span>
                              <h3 className="font-semibold text-gray-900 dark:text-white">
                                {stageDef.title}
                              </h3>
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {stageDef.desc}
                              </p>
                            </div>
                            {isActive && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingStage(stageDef.number);
                                  setStageNotes(stageData?.notes ?? '');
                                }}
                              >
                                Add Notes
                              </Button>
                            )}
                          </div>

                          {stageData?.notes && (
                            <div className="mt-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-600 dark:text-gray-300 border-l-2 border-teal/40">
                              {stageData.notes}
                            </div>
                          )}

                          {(isActive || isComplete) && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {stageDef.outputs.map((o) => (
                                <span
                                  key={o}
                                  className={`text-xs px-2 py-1 rounded-full ${
                                    isComplete
                                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                      : 'bg-teal/10 text-teal-700 dark:text-teal'
                                  }`}
                                >
                                  {isComplete ? '✓ ' : '☐ '}
                                  {o}
                                </span>
                              ))}
                            </div>
                          )}

                          {isComplete && stageData?.completedAt && (
                            <p className="text-xs text-gray-400 mt-2">
                              Completed{' '}
                              {new Date(stageData.completedAt).toLocaleDateString(
                                'en-GB',
                                { day: 'numeric', month: 'short', year: 'numeric' }
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          {selectedProjectId && !workflow && (
            <Card className="flex items-center justify-center min-h-32 text-gray-400">
              <p className="text-sm">Loading project…</p>
            </Card>
          )}
        </div>
      </div>

      {/* Create project modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Procurement Project"
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-700 dark:text-gray-300 block mb-1">
              Project Name
            </label>
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="e.g. SIS Replacement 2026–27"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newProjectName.trim()) {
                  createMutation.mutate(newProjectName);
                }
              }}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(newProjectName)}
              disabled={!newProjectName.trim() || createMutation.isPending}
            >
              Create Project
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit stage notes modal */}
      <Modal
        open={editingStage !== null}
        onClose={() => setEditingStage(null)}
        title={`Stage ${editingStage} Notes`}
      >
        <div className="space-y-4">
          <textarea
            value={stageNotes}
            onChange={(e) => setStageNotes(e.target.value)}
            rows={4}
            placeholder="Record decisions, attendees, actions…"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setEditingStage(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                updateStageMutation.mutate({
                  stageNum: editingStage!,
                  notes: stageNotes,
                })
              }
              disabled={updateStageMutation.isPending}
            >
              Save Notes
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
