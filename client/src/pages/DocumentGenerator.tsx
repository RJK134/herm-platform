import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Download, Save, Eye, RefreshCw, Trash2, Edit3,
  ChevronDown, ChevronUp, CheckCircle, AlertTriangle,
  Briefcase, ClipboardList, Users, FileCheck, AlignLeft,
  PlusCircle, Archive,
} from 'lucide-react';
import axios from 'axios';
import { PRODUCT } from '../lib/branding';
import type { ApiResponse } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type DocType = 'BUSINESS_CASE' | 'RFP_ITT' | 'SHORTLIST_REPORT' | 'REQUIREMENTS_SPEC' | 'EXECUTIVE_SUMMARY';
type DocStatus = 'DRAFT' | 'REVIEW' | 'FINAL' | 'ARCHIVED';
type Classification = 'Public' | 'Internal' | 'Restricted' | 'Confidential';

interface DocumentSection {
  id: string;
  title: string;
  content: string;
  order: number;
  locked?: boolean;
}

interface DocumentMeta {
  author: string;
  institution: string;
  date: string;
  version: string;
  classification: Classification;
  reference?: string;
}

interface GeneratedDoc {
  sections: DocumentSection[];
  title: string;
  type: DocType;
  wordCount: number;
  metadata?: DocumentMeta;
}

interface SavedDoc {
  id: string;
  title: string;
  type: DocType;
  status: DocStatus;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  sections: DocumentSection[];
  metadata?: DocumentMeta;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOC_TYPES: {
  id: DocType;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  colour: string;
  pages: string;
}[] = [
  {
    id: 'BUSINESS_CASE',
    label: "Business Case",
    desc: 'Full strategic business case for IT committee and governors. Includes options appraisal, NPV, and benefits realisation plan.',
    icon: Briefcase,
    colour: 'border-blue-500 bg-blue-50 dark:bg-blue-950/30',
    pages: '15–25 pages',
  },
  {
    id: 'RFP_ITT',
    label: "RFP / ITT",
    desc: 'UK Procurement Act 2023-compliant Invitation to Tender. Includes supplier instructions, scoring matrix, and compliance requirements.',
    icon: ClipboardList,
    colour: 'border-purple-500 bg-purple-50 dark:bg-purple-950/30',
    pages: '40–60 pages',
  },
  {
    id: 'SHORTLIST_REPORT',
    label: "Shortlist Report",
    desc: 'Evaluation report comparing shortlisted suppliers. MEAT-based scoring with narrative justification for audit trail.',
    icon: Users,
    colour: 'border-amber-500 bg-amber-50 dark:bg-amber-950/30',
    pages: '8–12 pages',
  },
  {
    id: 'REQUIREMENTS_SPEC',
    label: "Requirements Specification",
    desc: 'Functional and non-functional requirements drawn from your capability basket. MoSCoW prioritisation with scoring matrix.',
    icon: FileCheck,
    colour: 'border-teal-500 bg-teal-50 dark:bg-teal-950/30',
    pages: '20–35 pages',
  },
  {
    id: 'EXECUTIVE_SUMMARY',
    label: "Executive Summary",
    desc: 'Concise 2-page summary of the procurement case. Suitable for Vice-Chancellor briefings and board papers.',
    icon: AlignLeft,
    colour: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
    pages: '2–4 pages',
  },
];

const STATUS_CONFIG: Record<DocStatus, { label: string; colour: string }> = {
  DRAFT:    { label: 'Draft',    colour: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
  REVIEW:   { label: 'Review',   colour: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  FINAL:    { label: 'Final',    colour: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  ARCHIVED: { label: 'Archived', colour: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' },
};

const CLASSIFICATIONS: Classification[] = ['Public', 'Internal', 'Restricted', 'Confidential'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const downloadHtml = (title: string, sections: DocumentSection[], meta?: DocumentMeta) => {
  const metaHtml = meta
    ? `<table style="font-size:11px;color:#555;border-collapse:collapse;width:100%;margin-bottom:2rem">
        <tr><td style="padding:4px 12px 4px 0"><b>Author:</b> ${meta.author || '—'}</td>
            <td style="padding:4px 12px 4px 0"><b>Institution:</b> ${meta.institution || '—'}</td>
            <td style="padding:4px 12px 4px 0"><b>Date:</b> ${meta.date || new Date().toLocaleDateString('en-GB')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><b>Version:</b> ${meta.version}</td>
            <td style="padding:4px 12px 4px 0"><b>Classification:</b> ${meta.classification}</td>
            <td style="padding:4px 12px 4px 0">${meta.reference ? '<b>Ref:</b> ' + meta.reference : ''}</td></tr>
       </table>`
    : '';
  const sectionsHtml = sections
    .sort((a, b) => a.order - b.order)
    .map(s => `<h2 style="font-size:16px;border-bottom:2px solid #1a9e8f;padding-bottom:6px;margin-top:2rem">${s.title}</h2><div style="font-size:13px;line-height:1.7;color:#333;white-space:pre-wrap">${s.content}</div>`)
    .join('\n');
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${title}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 40px; color: #222; }
  h1 { font-size: 24px; color: #1a9e8f; margin-bottom: 0.5rem; }
  .subtitle { font-size: 13px; color: #888; margin-bottom: 1.5rem; }
  @media print { body { max-width: 100%; margin: 0; padding: 20px; } }
</style>
</head>
<body>
  <h1>${title}</h1>
  <div class="subtitle">Generated by ${PRODUCT.name} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  ${metaHtml}
  ${sectionsHtml}
</body>
</html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Section editor ─────────────────────────────────────────────────────────────

function SectionEditor({
  section, onChange,
}: {
  section: DocumentSection;
  onChange: (updated: DocumentSection) => void;
}) {
  const { t } = useTranslation('procurement');
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-400 dark:text-gray-500 w-5">{section.order}.</span>
          <span className="text-sm font-medium text-gray-900 dark:text-white">{section.title}</span>
          {section.locked && (
            <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">{t("docgen.locked", "locked")}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-xs">{section.content.split(/\s+/).filter(Boolean).length} words</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      {open && (
        <div className="p-4 space-y-2">
          <input
            value={section.title}
            onChange={e => onChange({ ...section, title: e.target.value })}
            className="w-full px-3 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
          />
          <textarea
            value={section.content}
            onChange={e => onChange({ ...section, content: e.target.value })}
            rows={12}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500 resize-y font-mono"
          />
        </div>
      )}
    </div>
  );
}

// ── Saved document row ─────────────────────────────────────────────────────────

function SavedDocRow({ doc, onOpen, onDelete }: {
  doc: SavedDoc;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('procurement');
  const typeConf = DOC_TYPES.find(d => d.id === doc.type);
  const Icon = typeConf?.icon ?? FileText;
  const statusConf = STATUS_CONFIG[doc.status];

  return (
    <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-teal-500/50 transition-colors">
      <Icon className="w-5 h-5 text-gray-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{doc.title}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{typeConf?.label} · {doc.wordCount.toLocaleString()} words · {fmtDate(doc.createdAt)}</div>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusConf.colour}`}>{statusConf.label}</span>
      <button onClick={onOpen} className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex-shrink-0">{t("docgen.open", "Open")}</button>
      <button onClick={onDelete} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function DocumentGenerator() {
  const { t } = useTranslation("procurement");
  const queryClient = useQueryClient();

  // View state: 'select' | 'configure' | 'preview' | 'saved'
  const [view, setView] = useState<'select' | 'configure' | 'preview' | 'saved'>('select');
  const [selectedType, setSelectedType] = useState<DocType | null>(null);

  // Config form
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [basketId, setBasketId] = useState('');
  const [tcoEstimateId, setTcoEstimateId] = useState('');
  const [valueAnalysisId, setValueAnalysisId] = useState('');
  const [customIntro, setCustomIntro] = useState('');
  const [customRec, setCustomRec] = useState('');
  const [meta, setMeta] = useState<DocumentMeta>({
    author: '',
    institution: '',
    date: new Date().toLocaleDateString('en-GB'),
    version: '1.0',
    classification: 'Internal',
  });

  // Generated doc state
  const [generated, setGenerated] = useState<GeneratedDoc | null>(null);
  const [editedSections, setEditedSections] = useState<DocumentSection[]>([]);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);

  // Fetch projects
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => axios.get<ApiResponse<{ id: string; name: string }[]>>('/api/procurement/projects'),
    staleTime: 5 * 60 * 1000,
  });
  const projects = projectsData?.data?.data ?? [];

  // Fetch baskets
  const { data: basketsData } = useQuery({
    queryKey: ['baskets'],
    queryFn: () => axios.get<ApiResponse<{ id: string; name: string }[]>>('/api/baskets'),
    staleTime: 5 * 60 * 1000,
  });
  const baskets = basketsData?.data?.data ?? [];

  // Fetch TCO estimates
  const { data: tcoData } = useQuery({
    queryKey: ['tco-estimates'],
    queryFn: () => axios.get<ApiResponse<{ id: string; systemSlug: string }[]>>('/api/tco/estimates'),
    staleTime: 5 * 60 * 1000,
  });
  const tcoEstimates = tcoData?.data?.data ?? [];

  // Fetch value analyses
  const { data: valueData } = useQuery({
    queryKey: ['value-analyses'],
    queryFn: () => axios.get<ApiResponse<{ id: string; name: string }[]>>('/api/value'),
    staleTime: 5 * 60 * 1000,
  });
  const valueAnalyses = valueData?.data?.data ?? [];

  // Fetch saved documents
  const { data: savedData, refetch: refetchSaved } = useQuery({
    queryKey: ['documents'],
    queryFn: () => axios.get<ApiResponse<SavedDoc[]>>('/api/documents'),
    staleTime: 2 * 60 * 1000,
  });
  const savedDocs = savedData?.data?.data ?? [];

  // Generate (stateless preview)
  const generateMutation = useMutation({
    mutationFn: () =>
      axios.post<ApiResponse<GeneratedDoc>>('/api/documents/generate', {
        title: title || `${DOC_TYPES.find(d => d.id === selectedType)?.label} — ${new Date().toLocaleDateString('en-GB')}`,
        type: selectedType,
        projectId: projectId || undefined,
        basketId: basketId || undefined,
        tcoEstimateId: tcoEstimateId || undefined,
        valueAnalysisId: valueAnalysisId || undefined,
        metadata: meta,
        customIntroduction: customIntro || undefined,
        customRecommendation: customRec || undefined,
      }),
    onSuccess: (res) => {
      if (res.data?.data) {
        setGenerated(res.data.data);
        setEditedSections(res.data.data.sections);
        setSavedDocId(null);
        setView('preview');
      }
    },
  });

  // Save document
  const saveMutation = useMutation({
    mutationFn: () =>
      axios.post<ApiResponse<{ id: string }>>('/api/documents', {
        title: title || `${DOC_TYPES.find(d => d.id === selectedType)?.label} — ${new Date().toLocaleDateString('en-GB')}`,
        type: selectedType,
        projectId: projectId || undefined,
        basketId: basketId || undefined,
        tcoEstimateId: tcoEstimateId || undefined,
        valueAnalysisId: valueAnalysisId || undefined,
        metadata: meta,
        customIntroduction: customIntro || undefined,
        customRecommendation: customRec || undefined,
      }),
    onSuccess: (res) => {
      if (res.data?.data?.id) {
        setSavedDocId(res.data.data.id);
        void queryClient.invalidateQueries({ queryKey: ['documents'] });
      }
    },
  });

  // Delete document
  const deleteMutation = useMutation({
    mutationFn: (id: string) => axios.delete(`/api/documents/${id}`),
    onSuccess: () => { void refetchSaved(); },
  });

  const handleSectionChange = (updated: DocumentSection) => {
    setEditedSections(prev => prev.map(s => s.id === updated.id ? updated : s));
  };

  const currentTypeConf = DOC_TYPES.find(d => d.id === selectedType);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-teal-600" />
            {t("docgen.title", "Document Generator")}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {t("docgen.subtitle", "Generate professional procurement documents populated from your platform data. UK Procurement Act 2023 compliant.")}
          </p>
        </div>
        <button
          onClick={() => setView(view === 'saved' ? 'select' : 'saved')}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
        >
          <Archive className="w-4 h-4" />
          {t("docgen.saved", "Saved")} ({savedDocs.length})
        </button>
      </div>

      {/* ── View: Saved documents ── */}
      {view === 'saved' && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t("docgen.savedDocuments", "Saved Documents")}</h2>
          {savedDocs.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{t("docgen.noDocumentsSaved", "No documents saved yet.")}</p>
              <button onClick={() => setView('select')} className="mt-3 text-teal-600 dark:text-teal-400 underline text-sm">{t("docgen.generateFirst", "Generate your first document")}              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {savedDocs.map(doc => (
                <SavedDocRow
                  key={doc.id}
                  doc={doc}
                  onOpen={() => {
                    setGenerated({ sections: doc.sections, title: doc.title, type: doc.type, wordCount: doc.wordCount, metadata: doc.metadata });
                    setEditedSections(doc.sections);
                    setSavedDocId(doc.id);
                    setView('preview');
                  }}
                  onDelete={() => deleteMutation.mutate(doc.id)}
                />
              ))}
            </div>
          )}
          <button
            onClick={() => setView('select')}
            className="flex items-center gap-2 text-teal-600 dark:text-teal-400 hover:underline text-sm font-medium"
          >
            <PlusCircle className="w-4 h-4" /> {t("docgen.generateNew", "Generate new document")}
          </button>
        </div>
      )}

      {/* ── View: Select document type ── */}
      {view === 'select' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t("docgen.chooseDocType", "Choose Document Type")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {DOC_TYPES.map(dt => {
              const Icon = dt.icon;
              return (
                <button
                  key={dt.id}
                  onClick={() => {
                    setSelectedType(dt.id);
                    setView('configure');
                  }}
                  className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                    selectedType === dt.id
                      ? dt.colour + ' border-opacity-100'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className="w-5 h-5 mt-0.5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{dt.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{dt.desc}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-2 flex items-center gap-1">
                        <AlignLeft className="w-3 h-3" /> {dt.pages}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── View: Configure ── */}
      {view === 'configure' && selectedType && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {/* Document title */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {currentTypeConf?.label} — {t("docgen.configuration", "Configuration")}
              </h2>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{t("docgen.documentTitle", "Document Title")}</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={`${currentTypeConf?.label} — ${new Date().toLocaleDateString('en-GB')}`}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Data connections */}
              <div>
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">{t("docgen.connectPlatformData", "Connect Platform Data")}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(selectedType === 'BUSINESS_CASE' || selectedType === 'RFP_ITT' || selectedType === 'SHORTLIST_REPORT') && (
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{t("docgen.procurementProject", "Procurement Project")}</label>
                      <select
                        value={projectId}
                        onChange={e => setProjectId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">— None —</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}

                  {(selectedType === 'BUSINESS_CASE' || selectedType === 'RFP_ITT' || selectedType === 'REQUIREMENTS_SPEC') && (
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{t("docgen.capabilityBasket", "Capability Basket")}</label>
                      <select
                        value={basketId}
                        onChange={e => setBasketId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">— None —</option>
                        {baskets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  )}

                  {(selectedType === 'BUSINESS_CASE' || selectedType === 'EXECUTIVE_SUMMARY') && (
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{t("docgen.tcoEstimate", "TCO Estimate")}</label>
                      <select
                        value={tcoEstimateId}
                        onChange={e => setTcoEstimateId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">— None —</option>
                        {(tcoEstimates as { id: string; systemSlug: string }[]).map(t => <option key={t.id} value={t.id}>{t.systemSlug}</option>)}
                      </select>
                    </div>
                  )}

                  {(selectedType === 'BUSINESS_CASE' || selectedType === 'EXECUTIVE_SUMMARY') && (
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{t("docgen.valueAnalysis", "Value Analysis")}</label>
                      <select
                        value={valueAnalysisId}
                        onChange={e => setValueAnalysisId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">— None —</option>
                        {(valueAnalyses as { id: string; name: string }[]).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Custom text */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{t("docgen.customIntro", "Custom Introduction (optional)")}</label>
                  <textarea
                    value={customIntro}
                    onChange={e => setCustomIntro(e.target.value)}
                    rows={3}
                    placeholder="Override the auto-generated introduction paragraph…"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{t("docgen.customRec", "Custom Recommendation (optional)")}</label>
                  <textarea
                    value={customRec}
                    onChange={e => setCustomRec(e.target.value)}
                    rows={3}
                    placeholder="Override the auto-generated recommendation section…"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t("docgen.documentMetadata", "Document Metadata")}</h3>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { key: 'author', label: 'Author / Prepared by' },
                  { key: 'institution', label: 'Institution name' },
                  { key: 'date', label: 'Document date' },
                  { key: 'version', label: 'Version' },
                  { key: 'reference', label: 'Document reference (optional)' },
                ] as { key: keyof DocumentMeta; label: string }[]).map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
                    <input
                      value={(meta[key] as string) ?? ''}
                      onChange={e => setMeta(m => ({ ...m, [key]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Classification</label>
                  <select
                    value={meta.classification}
                    onChange={e => setMeta(m => ({ ...m, classification: e.target.value as Classification }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className={`rounded-xl border-2 p-5 ${currentTypeConf?.colour}`}>
              <div className="flex items-center gap-2 mb-2">
                {currentTypeConf && <currentTypeConf.icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />}
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{currentTypeConf?.label}</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{currentTypeConf?.desc}</p>
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t("docgen.typicalLength", "Typical length:")}{" "}{currentTypeConf?.pages}</div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-xs text-gray-600 dark:text-gray-400 space-y-2">
              <div className="font-semibold text-gray-700 dark:text-gray-300">{t("docgen.whatAutoPopulated", "What gets auto-populated?")}</div>
              <ul className="space-y-1 list-disc list-inside">
                {projectId && <li className="text-teal-600 dark:text-teal-400">✓ Project timeline &amp; shortlist</li>}
                {basketId && <li className="text-teal-600 dark:text-teal-400">✓ Capability requirements from basket</li>}
                {tcoEstimateId && <li className="text-teal-600 dark:text-teal-400">✓ TCO/cost comparison data</li>}
                {valueAnalysisId && <li className="text-teal-600 dark:text-teal-400">✓ ROI / NPV / payback figures</li>}
                {!projectId && !basketId && !tcoEstimateId && !valueAnalysisId && (
                  <li className="text-gray-400">Connect data above for richer content</li>
                )}
              </ul>
              <p className="text-gray-500 dark:text-gray-500 italic">{t("docgen.editAfterGeneration", "You can edit all sections after generation.")}</p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Eye className={`w-4 h-4 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
                {generateMutation.isPending ? t("docgen.generating", "Generating…") : t("docgen.generatePreview", "Generate Preview")}
              </button>
              <button
                onClick={() => setView('select')}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                {t("docgen.changeDocType", "← Change document type")}
              </button>
            </div>

            {generateMutation.isError && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs">
                <AlertTriangle className="w-4 h-4" />
                {t("docgen.generationFailed", "Generation failed — check server connection")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── View: Preview / Edit ── */}
      {view === 'preview' && generated && (
        <div className="space-y-5">
          {/* Toolbar */}
          <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-3">
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">{generated.title}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-3">
                <span>{DOC_TYPES.find(d => d.id === generated.type)?.label}</span>
                <span className="flex items-center gap-1"><AlignLeft className="w-3 h-3" /> {editedSections.reduce((a, s) => a + s.content.split(/\s+/).filter(Boolean).length, 0).toLocaleString()} words</span>
                {generated.metadata?.classification && (
                  <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded text-xs font-medium">
                    {generated.metadata.classification}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadHtml(generated.title, editedSections, generated.metadata)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> {t("docgen.exportHtml", "Export HTML")}
              </button>
              {savedDocId ? (
                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                  <CheckCircle className="w-3.5 h-3.5" /> {t("docgen.savedLabel", "Saved")}
                </div>
              ) : (
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saveMutation.isPending ? t("docgen.saving", "Saving…") : t("docgen.save", "Save")}
                </button>
              )}
              <button
                onClick={() => { setView('configure'); setGenerated(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> {t("docgen.regenerate", "Regenerate")}
              </button>
            </div>
          </div>

          {/* Metadata bar */}
          {generated.metadata && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs text-gray-600 dark:text-gray-400">
              {generated.metadata.author && <div><span className="font-medium">Author:</span> {generated.metadata.author}</div>}
              {generated.metadata.institution && <div><span className="font-medium">Institution:</span> {generated.metadata.institution}</div>}
              {generated.metadata.date && <div><span className="font-medium">Date:</span> {generated.metadata.date}</div>}
              <div><span className="font-medium">Version:</span> {generated.metadata.version}</div>
              {generated.metadata.reference && <div><span className="font-medium">Ref:</span> {generated.metadata.reference}</div>}
            </div>
          )}

          {/* Edit hint */}
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-950/30 rounded-lg px-4 py-2.5 border border-blue-200 dark:border-blue-800">
            <Edit3 className="w-3.5 h-3.5 text-blue-500" />
            {t("docgen.editHint", "Click any section to expand and edit the content. Changes are local until you save.")}
          </div>

          {/* Sections */}
          <div className="space-y-2">
            {editedSections
              .sort((a, b) => a.order - b.order)
              .map(section => (
                <SectionEditor
                  key={section.id}
                  section={section}
                  onChange={handleSectionChange}
                />
              ))}
          </div>

          {/* Bottom actions */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setView('select')}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              {t("docgen.newDocument", "← New document")}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadHtml(generated.title, editedSections, generated.metadata)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Download className="w-4 h-4" /> {t("docgen.exportHtml", "Export HTML")}
              </button>
              {!savedDocId && (
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {saveMutation.isPending ? t("docgen.saving", "Saving…") : t("docgen.saveDocument", "Save Document")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {generateMutation.isPending && view !== 'preview' && (
        <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin mr-3" />
          <span>{t("docgen.generatingFromData", "Generating document from platform data…")}</span>
        </div>
      )}
    </div>
  );
}
