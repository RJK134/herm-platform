import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Building2, Search, CheckCircle, XCircle, AlertTriangle,
  Users, BarChart2, ChevronRight, Globe, Mail, User,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Header } from '../components/layout/Header';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface VendorAccountRow {
  id: string;
  companyName: string;
  contactEmail: string;
  contactName: string;
  tier: 'BASIC' | 'ENHANCED' | 'PREMIUM';
  status: string;
  createdAt: string;
  system?: { id: string; name: string; vendor: string } | null;
  _count: { submissions: number; users: number };
}

interface VendorSubmission {
  id: string;
  vendorAccountId: string;
  type: string;
  data: Record<string, unknown>;
  status: string;
  submittedAt: string;
  reviewNotes?: string;
}

interface SystemOption {
  id: string;
  name: string;
  vendor: string;
}

interface AdminStats {
  total: number;
  pending: number;
  approved: number;
  submissionsPending: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type SidebarTab = 'All' | 'Pending' | 'Approved' | 'Submissions';

const STATUS_COLOURS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  suspended: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  review: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

const TIER_COLOURS: Record<string, string> = {
  BASIC: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  ENHANCED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  PREMIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminVendors() {
  const qc = useQueryClient();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('All');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const vendorsQuery = useQuery<VendorAccountRow[]>({
    queryKey: ['admin-vendors'],
    queryFn: () =>
      axios.get<{ success: boolean; data: VendorAccountRow[] }>('/api/admin/vendors')
        .then(r => r.data.data),
  });

  const submissionsListQuery = useQuery<VendorSubmission[]>({
    queryKey: ['admin-submissions-all'],
    queryFn: () =>
      axios.get<{ success: boolean; data: VendorSubmission[] }>('/api/admin/submissions')
        .then(r => r.data.data),
    enabled: sidebarTab === 'Submissions',
  });

  const vendorSubmissionsQuery = useQuery<VendorSubmission[]>({
    queryKey: ['admin-vendor-submissions', selectedId],
    queryFn: () =>
      axios.get<{ success: boolean; data: VendorSubmission[] }>(`/api/admin/vendors/${selectedId}/submissions`)
        .then(r => r.data.data),
    enabled: !!selectedId,
  });

  const systemsQuery = useQuery<SystemOption[]>({
    queryKey: ['systems-simple'],
    queryFn: () =>
      axios.get<{ success: boolean; data: SystemOption[] }>('/api/systems?limit=50')
        .then(r => r.data.data),
  });

  const vendors = vendorsQuery.data ?? [];

  const stats: AdminStats = {
    total: vendors.length,
    pending: vendors.filter(v => v.status === 'pending').length,
    approved: vendors.filter(v => v.status === 'approved').length,
    submissionsPending: (submissionsListQuery.data ?? []).filter(s => s.status === 'pending').length,
  };

  const filteredVendors = vendors.filter(v => {
    const matchesSearch =
      v.companyName.toLowerCase().includes(search.toLowerCase()) ||
      v.contactEmail.toLowerCase().includes(search.toLowerCase());
    const matchesTab =
      sidebarTab === 'All' ||
      (sidebarTab === 'Pending' && v.status === 'pending') ||
      (sidebarTab === 'Approved' && v.status === 'approved');
    return matchesSearch && matchesTab;
  });

  const selectedVendor = vendors.find(v => v.id === selectedId) ?? null;

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      axios.patch(`/api/admin/vendors/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-vendors'] }),
  });

  const linkSystemMutation = useMutation({
    mutationFn: ({ id, systemId }: { id: string; systemId: string }) =>
      axios.patch(`/api/admin/vendors/${id}`, { systemId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-vendors'] }),
  });

  const tierMutation = useMutation({
    mutationFn: ({ id, tier }: { id: string; tier: string }) =>
      axios.patch(`/api/admin/vendors/${id}`, { tier }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-vendors'] }),
  });

  const submissionActionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      axios.patch(`/api/admin/submissions/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-vendor-submissions', selectedId] });
      qc.invalidateQueries({ queryKey: ['admin-submissions-all'] });
    },
  });

  const SIDEBAR_TABS: SidebarTab[] = ['All', 'Pending', 'Approved', 'Submissions'];

  return (
    <div className="space-y-6">
      <Header title="Vendor Management" subtitle="Review and manage vendor accounts, profiles, and submissions" />

      <div className="flex gap-4 h-[calc(100vh-200px)]">
        {/* ── Left Sidebar ─────────────────────────────────────────── */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              placeholder="Search vendors…"
            />
          </div>

          {/* Tab filter */}
          <div className="flex gap-1.5 flex-wrap">
            {SIDEBAR_TABS.map(t => (
              <button
                key={t}
                onClick={() => setSidebarTab(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  sidebarTab === t
                    ? 'bg-teal-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {t}
                {t === 'Pending' && stats.pending > 0 && (
                  <span className="ml-1.5 bg-white/20 rounded-full px-1">{stats.pending}</span>
                )}
              </button>
            ))}
          </div>

          {/* Vendor list */}
          <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {sidebarTab === 'Submissions' ? (
              (submissionsListQuery.data ?? []).map(sub => (
                <button
                  key={sub.id}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => {
                    setSelectedId(sub.vendorAccountId);
                    setSidebarTab('All');
                  }}
                >
                  <p className="text-sm font-medium dark:text-white">{sub.type.replace(/_/g, ' ')}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={sub.status} />
                    <span className="text-xs text-gray-400">{new Date(sub.submittedAt).toLocaleDateString('en-GB')}</span>
                  </div>
                </button>
              ))
            ) : (
              filteredVendors.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center justify-between ${selectedId === v.id ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium dark:text-white truncate">{v.companyName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{v.contactEmail}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <StatusBadge status={v.status} />
                      {v._count.submissions > 0 && (
                        <span className="text-xs text-gray-400">{v._count.submissions} submission{v._count.submissions !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
                </button>
              ))
            )}
            {sidebarTab !== 'Submissions' && filteredVendors.length === 0 && (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">No vendors found</p>
            )}
          </div>
        </div>

        {/* ── Right Panel ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {!selectedVendor ? (
            <div className="space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Vendors', value: stats.total, icon: Building2, colour: 'text-teal-500' },
                  { label: 'Pending Approval', value: stats.pending, icon: AlertTriangle, colour: 'text-amber-500' },
                  { label: 'Approved', value: stats.approved, icon: CheckCircle, colour: 'text-emerald-500' },
                  { label: 'Submissions Pending', value: stats.submissionsPending, icon: BarChart2, colour: 'text-blue-500' },
                ].map(({ label, value, icon: Icon, colour }) => (
                  <Card key={label} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                        <p className="text-2xl font-bold dark:text-white mt-1">{value}</p>
                      </div>
                      <Icon className={`w-6 h-6 ${colour}`} />
                    </div>
                  </Card>
                ))}
              </div>

              {/* Status bar chart */}
              <Card>
                <h3 className="font-semibold dark:text-white text-sm mb-4">Vendors by Status</h3>
                {(['pending', 'approved', 'rejected', 'suspended'] as const).map(status => {
                  const count = vendors.filter(v => v.status === status).length;
                  const pct = vendors.length > 0 ? (count / vendors.length) * 100 : 0;
                  return (
                    <div key={status} className="flex items-center gap-3 mb-2">
                      <span className="text-xs w-20 capitalize text-gray-600 dark:text-gray-400">{status}</span>
                      <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            status === 'approved' ? 'bg-emerald-500' :
                            status === 'pending' ? 'bg-amber-500' :
                            status === 'rejected' ? 'bg-red-500' : 'bg-orange-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-6">{count}</span>
                    </div>
                  );
                })}
              </Card>

              <Card className="text-center py-8">
                <Building2 className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Select a vendor from the list to view details</p>
              </Card>
            </div>
          ) : (
            <VendorDetail
              vendor={selectedVendor}
              systems={systemsQuery.data ?? []}
              submissions={vendorSubmissionsQuery.data ?? []}
              onStatusChange={(status) => statusMutation.mutate({ id: selectedVendor.id, status })}
              onLinkSystem={(systemId) => linkSystemMutation.mutate({ id: selectedVendor.id, systemId })}
              onTierChange={(tier) => tierMutation.mutate({ id: selectedVendor.id, tier })}
              onSubmissionAction={(subId, status) => submissionActionMutation.mutate({ id: subId, status })}
              isPending={statusMutation.isPending || linkSystemMutation.isPending || tierMutation.isPending}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Vendor Detail Panel ───────────────────────────────────────────────────────

interface VendorDetailProps {
  vendor: VendorAccountRow;
  systems: SystemOption[];
  submissions: VendorSubmission[];
  onStatusChange: (status: string) => void;
  onLinkSystem: (systemId: string) => void;
  onTierChange: (tier: string) => void;
  onSubmissionAction: (subId: string, status: string) => void;
  isPending: boolean;
}

function VendorDetail({
  vendor, systems, submissions,
  onStatusChange, onLinkSystem, onTierChange, onSubmissionAction, isPending,
}: VendorDetailProps) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold dark:text-white">{vendor.companyName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2.5 py-1 rounded-full text-sm font-medium ${STATUS_COLOURS[vendor.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {vendor.status}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-sm font-medium ${TIER_COLOURS[vendor.tier]}`}>
                {vendor.tier}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Joined {new Date(vendor.createdAt).toLocaleDateString('en-GB')}
          </p>
        </div>

        {/* Contact info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Mail className="w-4 h-4 flex-shrink-0 text-gray-400" />
            <a href={`mailto:${vendor.contactEmail}`} className="hover:text-teal-600 dark:hover:text-teal-400 truncate">{vendor.contactEmail}</a>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <User className="w-4 h-4 flex-shrink-0 text-gray-400" />
            <span>{vendor.contactName}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Users className="w-4 h-4 flex-shrink-0 text-gray-400" />
            <span>{vendor._count.users} user{vendor._count.users !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* System link */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Linked System</label>
          <div className="flex items-center gap-2">
            {vendor.system && (
              <span className="text-sm font-medium dark:text-white mr-2">
                {vendor.system.name} — {vendor.system.vendor}
              </span>
            )}
            <select
              defaultValue={vendor.system?.id ?? ''}
              onChange={e => e.target.value && onLinkSystem(e.target.value)}
              className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            >
              <option value="">— Select system to link —</option>
              {systems.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.vendor})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tier selector */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tier</label>
          <select
            defaultValue={vendor.tier}
            onChange={e => onTierChange(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
          >
            <option value="BASIC">BASIC — Free</option>
            <option value="ENHANCED">ENHANCED — £3,500/yr</option>
            <option value="PREMIUM">PREMIUM — £12,000/yr</option>
          </select>
        </div>

        {/* Approval actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
            onClick={() => onStatusChange('approved')}
            disabled={isPending || vendor.status === 'approved'}
          >
            <CheckCircle className="w-4 h-4" /> Approve
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5"
            onClick={() => onStatusChange('rejected')}
            disabled={isPending || vendor.status === 'rejected'}
          >
            <XCircle className="w-4 h-4" /> Reject
          </Button>
          <Button
            className="bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-1.5"
            onClick={() => onStatusChange('suspended')}
            disabled={isPending || vendor.status === 'suspended'}
          >
            <AlertTriangle className="w-4 h-4" /> Suspend
          </Button>
        </div>
      </Card>

      {/* Submissions */}
      {submissions.length > 0 && (
        <Card>
          <h3 className="font-semibold dark:text-white text-sm mb-3">Submissions</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {submissions.map(sub => (
                <tr key={sub.id}>
                  <td className="py-2.5 text-gray-700 dark:text-gray-300">{sub.type.replace(/_/g, ' ')}</td>
                  <td className="py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                    {new Date(sub.submittedAt).toLocaleDateString('en-GB')}
                  </td>
                  <td className="py-2.5"><StatusBadge status={sub.status} /></td>
                  <td className="py-2.5">
                    {sub.status === 'pending' && (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => onSubmissionAction(sub.id, 'approved')}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          className="bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => onSubmissionAction(sub.id, 'rejected')}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onSubmissionAction(sub.id, 'changes_requested')}
                        >
                          Request Changes
                        </Button>
                      </div>
                    )}
                    {sub.status !== 'pending' && (
                      <span className="text-xs text-gray-400">{sub.reviewNotes ?? '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
