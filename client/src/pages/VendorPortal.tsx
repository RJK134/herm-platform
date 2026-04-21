import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Building2, LogOut, Star, Eye, BarChart2, ShoppingCart,
  ChevronDown, ChevronRight, CheckCircle, XCircle, AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface VendorUser {
  vendorUserId: string;
  vendorAccountId: string;
  email: string;
  name: string;
  role: string;
  companyName: string;
  tier: 'BASIC' | 'ENHANCED' | 'PREMIUM';
  type: 'vendor';
}

interface VendorProfile {
  id: string;
  companyName: string;
  contactEmail: string;
  contactName: string;
  tier: 'BASIC' | 'ENHANCED' | 'PREMIUM';
  status: string;
  websiteUrl?: string;
  description?: string;
  logoUrl?: string;
  system?: { id: string; name: string; vendor: string; category: string } | null;
  _count: { submissions: number };
}

interface VendorAnalytics {
  currentMonth: { profileViews: number; comparisonInclusions: number; basketInclusions: number; eoiResponses: number };
  trends: Record<string, number[]>;
  months: string[];
}

interface ScoreDomain {
  domainCode: string;
  domainName: string;
  capabilities: Array<{
    id: string;
    capability: { id: string; code: string; name: string };
    value: number;
    evidence?: string;
  }>;
}

interface ScoreResponse {
  overallScore: number;
  maxScore: number;
  percentage: number;
  byDomain: ScoreDomain[];
}

interface Submission {
  id: string;
  type: string;
  status: string;
  submittedAt: string;
  reviewNotes?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TABS = ['Dashboard', 'My Profile', 'HERM Scores', 'Subscription'] as const;
type Tab = typeof TABS[number];

const TIER_COLOURS: Record<string, string> = {
  BASIC: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  ENHANCED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  PREMIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const STATUS_COLOURS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  suspended: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
};

function scoreChip(value: number) {
  if (value >= 100) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (value >= 50) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
}

const FEATURE_TABLE = [
  { feature: 'View own scores', basic: true, enhanced: true, premium: true },
  { feature: 'Respond to EOIs', basic: true, enhanced: true, premium: true },
  { feature: 'Rich profile', basic: false, enhanced: true, premium: true },
  { feature: 'Analytics dashboard', basic: false, enhanced: true, premium: true },
  { feature: 'Priority positioning', basic: false, enhanced: true, premium: true },
  { feature: 'Sponsored content', basic: false, enhanced: false, premium: true },
  { feature: 'White-label reports', basic: false, enhanced: false, premium: true },
  { feature: 'Early EOI access', basic: false, enhanced: false, premium: true },
  { feature: 'Dedicated manager', basic: false, enhanced: false, premium: true },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function FeatureCell({ val }: { val: boolean }) {
  return val
    ? <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
    : <XCircle className="w-4 h-4 text-gray-300 dark:text-gray-600 mx-auto" />;
}

// ── Login / Register Panel ────────────────────────────────────────────────────

interface AuthPanelProps {
  onAuth: (token: string, user: VendorUser) => void;
}

function AuthPanel({ onAuth }: AuthPanelProps) {
  const { t } = useTranslation("vendor");
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(false);

  const loginMutation = useMutation({
    mutationFn: () =>
      axios.post<{ success: boolean; data: { token: string; user: VendorUser } }>(
        '/api/vendor-portal/login', { email, password }
      ),
    onSuccess: (res) => {
      if (res.data.success) {
        onAuth(res.data.data.token, res.data.data.user);
      }
    },
    onError: () => setError('Invalid credentials. Please try again.'),
  });

  const registerMutation = useMutation({
    mutationFn: () =>
      axios.post('/api/vendor-portal/register', {
        email, password, companyName, contactName,
        websiteUrl: website || undefined,
        description: description || undefined,
      }),
    onSuccess: () => setRegistered(true),
    onError: () => setError('Registration failed. Please try again.'),
  });

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
        <Card className="max-w-md w-full text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold dark:text-white mb-2">{t("portal.registrationSubmitted", "Registration Submitted")}</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Your account has been submitted for review. You&apos;ll receive an email when approved.
          </p>
          <Button className="mt-4" onClick={() => { setRegistered(false); setMode('login'); }}>
            Back to Login
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <Building2 className="w-8 h-8 text-teal-600 dark:text-teal-400" />
            <span className="text-2xl font-bold dark:text-white">{t("portal.title", "Vendor Portal")}</span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{t("portal.subtitle", "Manage your HERM platform profile and track performance")}</p>
        </div>

        {/* Mobile toggle */}
        <div className="flex gap-2 mb-6 md:hidden">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'login' ? 'bg-teal-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            Login
          </button>
          <button
            onClick={() => setMode('register')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'register' ? 'bg-teal-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            Register
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Login */}
          <Card className={`${mode === 'register' ? 'hidden md:block' : ''}`}>
            <h2 className="text-lg font-bold dark:text-white mb-4">{t("portal.loginTitle", "Vendor Portal Login")}</h2>
            {error && mode === 'login' && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">{error}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                  placeholder="vendor@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                  placeholder="••••••••"
                />
              </div>
              <Button
                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => { setError(''); loginMutation.mutate(); }}
                disabled={loginMutation.isPending || !email || !password}
              >
                {loginMutation.isPending ? t("portal.signingIn", "Signing in…") : t("portal.signIn", "Sign in")}
              </Button>
            </div>
            <p className="mt-4 text-xs text-center text-gray-500 dark:text-gray-400 md:hidden">
              No account?{' '}
              <button className="text-teal-600 dark:text-teal-400 underline" onClick={() => setMode('register')}>Register here</button>
            </p>
          </Card>

          {/* Register */}
          <Card className={`${mode === 'login' ? 'hidden md:block' : ''}`}>
            <h2 className="text-lg font-bold dark:text-white mb-4">{t("portal.registerTitle", "Register as a Vendor")}</h2>
            {error && mode === 'register' && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">{error}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company Name</label>
                <input
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  placeholder="Acme Software Ltd"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Name</label>
                <input
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  placeholder="jane@acme.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password (min 8 characters)</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Website URL (optional)</label>
                <input
                  type="url"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  placeholder="https://acme.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                  placeholder="Brief description of your product…"
                />
              </div>
              <Button
                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => { setError(''); registerMutation.mutate(); }}
                disabled={
                  registerMutation.isPending ||
                  !companyName || !contactName || !email || password.length < 8
                }
              >
                {registerMutation.isPending ? t("portal.submitting", "Submitting…") : t("portal.register", "Register")}
              </Button>
            </div>
            <p className="mt-4 text-xs text-center text-gray-500 dark:text-gray-400 md:hidden">
              Have an account?{' '}
              <button className="text-teal-600 dark:text-teal-400 underline" onClick={() => setMode('login')}>Login here</button>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Logged-in Dashboard ───────────────────────────────────────────────────────

interface DashboardProps {
  user: VendorUser;
  token: string;
  onSignOut: () => void;
}

function VendorDashboard({ user, token, onSignOut }: DashboardProps) {
  const { t } = useTranslation("vendor");
  const [activeTab, setActiveTab] = useState<Tab>('Dashboard');
  const qc = useQueryClient();

  const headers = { Authorization: `Bearer ${token}` };

  const profileQuery = useQuery<VendorProfile>({
    queryKey: ['vendor-profile'],
    queryFn: () =>
      axios.get<{ success: boolean; data: VendorProfile }>('/api/vendor-portal/profile', { headers })
        .then(r => r.data.data),
  });

  const analyticsQuery = useQuery<VendorAnalytics>({
    queryKey: ['vendor-analytics'],
    queryFn: () =>
      axios.get<{ success: boolean; data: VendorAnalytics }>('/api/vendor-portal/analytics', { headers })
        .then(r => r.data.data),
    enabled: activeTab === 'Dashboard',
  });

  const scoresQuery = useQuery<ScoreResponse>({
    queryKey: ['vendor-scores'],
    queryFn: () =>
      axios.get<{ success: boolean; data: ScoreResponse }>('/api/vendor-portal/scores', { headers })
        .then(r => r.data.data),
    enabled: activeTab === 'HERM Scores',
  });

  const submissionsQuery = useQuery<Submission[]>({
    queryKey: ['vendor-submissions'],
    queryFn: () =>
      axios.get<{ success: boolean; data: Submission[] }>('/api/vendor-portal/submissions', { headers })
        .then(r => r.data.data),
    enabled: activeTab === 'Subscription' || activeTab === 'Dashboard',
  });

  const profile = profileQuery.data;
  const analytics = analyticsQuery.data;
  const scores = scoresQuery.data;
  const submissions = submissionsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top nav */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
          <div>
            <p className="text-sm font-semibold dark:text-white">{user.companyName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
          </div>
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${TIER_COLOURS[user.tier]}`}>
            {user.tier}
          </span>
        </div>
        <button
          onClick={onSignOut}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4" /> {t("portal.signOut", "Sign out")}
        </button>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                activeTab === t
                  ? 'bg-teal text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-teal/10 hover:text-teal-700 dark:hover:text-teal-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Tab: Dashboard ─────────────────────────────────────── */}
        {activeTab === 'Dashboard' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold dark:text-white">
              Welcome back, {user.name} — {user.companyName}
            </h1>

            {/* Status banner */}
            {profile && (
              profile.status === 'pending' ? (
                <div className="flex items-center gap-2 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">Account under review — you'll be notified once approved.</span>
                </div>
              ) : profile.status === 'approved' ? (
                <div className="flex items-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-400">
                  <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">Your account is approved and active.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
                  <XCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">Account status: {profile.status}. Please contact support.</span>
                </div>
              )
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: t("dashboard.hermScore", "HERM Score"), value: scores ? `${scores.percentage.toFixed(1)}%` : '—', icon: Star, colour: 'text-amber-500' },
                { label: t("dashboard.profileViews", "Profile Views"), value: analytics?.currentMonth.profileViews ?? '—', icon: Eye, colour: 'text-blue-500' },
                { label: t("dashboard.comparisonInclusions", "Comparison Inclusions"), value: analytics?.currentMonth.comparisonInclusions ?? '—', icon: BarChart2, colour: 'text-teal-500' },
                { label: t("dashboard.basketInclusions", "Basket Inclusions"), value: analytics?.currentMonth.basketInclusions ?? '—', icon: ShoppingCart, colour: 'text-purple-500' },
              ].map(({ label, value, icon: Icon, colour }) => (
                <Card key={label} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                      <p className="text-2xl font-bold dark:text-white mt-1">{String(value)}</p>
                    </div>
                    <Icon className={`w-6 h-6 ${colour}`} />
                  </div>
                </Card>
              ))}
            </div>

            {/* Trend chart — CSS bars */}
            {analytics && analytics.trends.profile_views && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <h3 className="font-semibold dark:text-white text-sm">{t("dashboard.profileViewsTrend", "Profile Views — 6 Months")}</h3>
                </div>
                <div className="flex items-end gap-2 h-32">
                  {analytics.trends.profile_views.map((val, i) => {
                    const max = Math.max(...analytics.trends.profile_views, 1);
                    const pct = (val / max) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{val}</span>
                        <div
                          className="w-full bg-teal-500 dark:bg-teal-600 rounded-t-sm"
                          style={{ height: `${pct}%` }}
                        />
                        <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {analytics.months[i] ?? ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Recent submissions */}
            {submissions.length > 0 && (
              <Card>
                <h3 className="font-semibold dark:text-white text-sm mb-3">{t("dashboard.recentSubmissions", "Recent Submissions")}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {submissions.slice(0, 5).map(s => (
                      <tr key={s.id}>
                        <td className="py-2 text-gray-700 dark:text-gray-300">{s.type.replace(/_/g, ' ')}</td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="py-2 text-gray-500 dark:text-gray-400 text-xs">
                          {new Date(s.submittedAt).toLocaleDateString('en-GB')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        )}

        {/* ── Tab: My Profile ───────────────────────────────────── */}
        {activeTab === 'My Profile' && profile && (
          <ProfileTab profile={profile} token={token} onSaved={() => qc.invalidateQueries({ queryKey: ['vendor-profile'] })} />
        )}

        {/* ── Tab: HERM Scores ──────────────────────────────────── */}
        {activeTab === 'HERM Scores' && (
          <ScoresTab scores={scores} token={token} onSubmitted={() => qc.invalidateQueries({ queryKey: ['vendor-submissions'] })} />
        )}

        {/* ── Tab: Subscription ────────────────────────────────── */}
        {activeTab === 'Subscription' && (
          <SubscriptionTab tier={user.tier} token={token} submissions={submissions} />
        )}
      </div>
    </div>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ profile, token, onSaved }: { profile: VendorProfile; token: string; onSaved: () => void }) {
  const { t } = useTranslation('vendor');
  const [form, setForm] = useState({
    companyName: profile.companyName,
    contactName: profile.contactName,
    websiteUrl: profile.websiteUrl ?? '',
    phone: '',
    description: profile.description ?? '',
  });
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () =>
      axios.put('/api/vendor-portal/profile', form, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    onSuccess: () => { setSaved(true); onSaved(); setTimeout(() => setSaved(false), 3000); },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold dark:text-white">{t("profile.myProfile", "My Profile")}</h2>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[profile.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {profile.status}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIER_COLOURS[profile.tier]}`}>
            {profile.tier}
          </span>
        </div>
      </div>

      {profile.tier === 'BASIC' && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-700 dark:text-blue-400">
          Upgrade to Enhanced or Premium to unlock rich profile features, analytics, and priority positioning.
        </div>
      )}

      {profile.system && (
        <Card className="p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("profile.linkedSystem", "Linked System")}</p>
          <p className="font-semibold dark:text-white">{profile.system.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{profile.system.vendor} · {profile.system.category}</p>
        </Card>
      )}

      <Card>
        <div className="space-y-4">
          {([
            ['Company Name', 'companyName', 'text', 'Acme Software Ltd'],
            ['Contact Name', 'contactName', 'text', 'Jane Smith'],
            ['Website URL', 'websiteUrl', 'url', 'https://acme.com'],
            ['Phone', 'phone', 'tel', '+44 20 1234 5678'],
          ] as const).map(([label, field, type, placeholder]) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
              <input
                type={type}
                value={form[field as keyof typeof form]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder={placeholder}
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none"
              placeholder="Describe your product or company…"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? t("profile.saving", "Saving…") : t("profile.saveProfile", "Save Profile")}
            </Button>
            {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> {t("profile.saved", "Saved")}</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Scores Tab ────────────────────────────────────────────────────────────────

interface ChallengeForm {
  capabilityId: string;
  capabilityName: string;
  evidence: string;
  claimType: string;
}

function ScoresTab({ scores, token, onSubmitted }: { scores: ScoreResponse | undefined; token: string; onSubmitted: () => void }) {
  const { t } = useTranslation('vendor');
  const [openDomain, setOpenDomain] = useState<string | null>(null);
  const [challengeForm, setChallengeForm] = useState<ChallengeForm | null>(null);

  const challengeMutation = useMutation({
    mutationFn: (form: ChallengeForm) =>
      axios.post(
        '/api/vendor-portal/submissions',
        {
          type: 'score_challenge',
          data: { capabilityId: form.capabilityId, evidence: form.evidence, claimType: form.claimType },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      ),
    onSuccess: () => { setChallengeForm(null); onSubmitted(); },
  });

  if (!scores) {
    return (
      <Card>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Your account hasn&apos;t been linked to a system yet. Contact platform admin.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall */}
      <Card>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold text-teal-600 dark:text-teal-400">{scores.percentage.toFixed(1)}%</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("scores.overallHermScore", "Overall HERM Score")}</p>
          </div>
          <div className="flex-1">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all"
                style={{ width: `${scores.percentage}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{scores.overallScore} / {scores.maxScore} points</p>
          </div>
        </div>
      </Card>

      {/* Domains accordion */}
      <div className="space-y-2">
        {scores.byDomain.map(domain => (
          <Card key={domain.domainCode} className="p-0 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              onClick={() => setOpenDomain(openDomain === domain.domainCode ? null : domain.domainCode)}
            >
              <span className="font-semibold text-sm dark:text-white">{domain.domainCode} — {domain.domainName}</span>
              {openDomain === domain.domainCode ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            </button>
            {openDomain === domain.domainCode && (
              <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {domain.capabilities.map(cap => (
                  <div key={cap.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm dark:text-white">{cap.capability.code} — {cap.capability.name}</p>
                      {cap.evidence && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{cap.evidence}</p>}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${scoreChip(cap.value)}`}>
                        {cap.value}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setChallengeForm({
                          capabilityId: cap.capability.id,
                          capabilityName: cap.capability.name,
                          evidence: '',
                          claimType: 'Score Too Low',
                        })}
                      >
                        Challenge
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Challenge modal */}
      <Modal
        open={challengeForm !== null}
        onClose={() => setChallengeForm(null)}
        title={t("scores.challengeScore", "Challenge Score")}
      >
        {challengeForm && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Capability</label>
              <p className="text-sm dark:text-white">{challengeForm.capabilityName}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Claim Type</label>
              <select
                value={challengeForm.claimType}
                onChange={e => setChallengeForm(f => f ? { ...f, claimType: e.target.value } : f)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              >
                <option>Score Too Low</option>
                <option>Score Too High</option>
                <option>Evidence Update</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Evidence <span className="text-red-500">*</span></label>
              <textarea
                value={challengeForm.evidence}
                onChange={e => setChallengeForm(f => f ? { ...f, evidence: e.target.value } : f)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                placeholder="Provide supporting evidence for your challenge…"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setChallengeForm(null)}>Cancel</Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => challengeMutation.mutate(challengeForm)}
                disabled={challengeMutation.isPending || !challengeForm.evidence.trim()}
              >
                {challengeMutation.isPending ? t("scores.submitting", "Submitting…") : t("scores.submitChallenge", "Submit Challenge")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Subscription Tab ──────────────────────────────────────────────────────────

interface CheckoutResponse {
  configured: boolean;
  url?: string;
  message?: string;
}

function SubscriptionTab({ tier, token, submissions }: { tier: 'BASIC' | 'ENHANCED' | 'PREMIUM'; token: string; submissions: Submission[] }) {
  const { t } = useTranslation('vendor');
  const [upgradeMsg, setUpgradeMsg] = useState('');
  const [upgradeMsgOpen, setUpgradeMsgOpen] = useState(false);

  const checkoutMutation = useMutation({
    mutationFn: (checkoutTier: string) =>
      axios.post<CheckoutResponse>('/api/subscriptions/checkout', { tier: checkoutTier }, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    onSuccess: (res) => {
      if (res.data.configured === false) {
        setUpgradeMsg(res.data.message ?? 'Stripe is not configured. Please contact support.');
        setUpgradeMsgOpen(true);
      } else if (res.data.url) {
        window.location.href = res.data.url;
      }
    },
  });

  return (
    <div className="space-y-6">
      {/* Current tier */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Current Plan</p>
            <p className="text-2xl font-bold dark:text-white mt-1">{tier}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${TIER_COLOURS[tier]}`}>{tier}</span>
        </div>
      </Card>

      {/* Feature comparison */}
      <Card>
        <h3 className="font-semibold dark:text-white text-sm mb-4">{t("subscription.planComparison", "Plan Comparison")}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100 dark:border-gray-700">
                <th className="pb-3 font-medium text-gray-600 dark:text-gray-400 text-xs w-1/2">{t("subscription.feature", "Feature")}</th>
                <th className="pb-3 font-medium text-xs text-center">Basic<br /><span className="font-normal text-gray-400">Free</span></th>
                <th className="pb-3 font-medium text-xs text-center">Enhanced<br /><span className="font-normal text-gray-400">£3,500/yr</span></th>
                <th className="pb-3 font-medium text-xs text-center">Premium<br /><span className="font-normal text-gray-400">£12,000/yr</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {FEATURE_TABLE.map(row => (
                <tr key={row.feature}>
                  <td className="py-2.5 text-gray-700 dark:text-gray-300">{row.feature}</td>
                  <td className="py-2.5"><FeatureCell val={row.basic} /></td>
                  <td className="py-2.5"><FeatureCell val={row.enhanced} /></td>
                  <td className="py-2.5"><FeatureCell val={row.premium} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Upgrade buttons */}
        <div className="flex flex-wrap gap-3 mt-5 pt-5 border-t border-gray-100 dark:border-gray-700">
          {tier === 'BASIC' && (
            <>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => checkoutMutation.mutate('vendorEnhanced')}
                disabled={checkoutMutation.isPending}
              >
                {t("subscription.upgradeEnhanced", "Upgrade to Enhanced — £3,500/yr")}
              </Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => checkoutMutation.mutate('vendorPremium')}
                disabled={checkoutMutation.isPending}
              >
                {t("subscription.upgradePremium", "Upgrade to Premium — £12,000/yr")}
              </Button>
            </>
          )}
          {tier === 'ENHANCED' && (
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => checkoutMutation.mutate('vendorPremium')}
              disabled={checkoutMutation.isPending}
            >
              {t("subscription.upgradePremium", "Upgrade to Premium — £12,000/yr")}
            </Button>
          )}
          {tier === 'PREMIUM' && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" /> {t("subscription.onPremium", "You are on the Premium plan")}
            </span>
          )}
        </div>
      </Card>

      {/* Submissions history */}
      {submissions.length > 0 && (
        <Card>
          <h3 className="font-semibold dark:text-white text-sm mb-3">{t("subscription.submissionHistory", "Submission History")}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {submissions.map(s => (
                <tr key={s.id}>
                  <td className="py-2 text-gray-700 dark:text-gray-300">{s.type.replace(/_/g, ' ')}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="py-2 text-gray-500 dark:text-gray-400 text-xs">
                    {new Date(s.submittedAt).toLocaleDateString('en-GB')}
                  </td>
                  <td className="py-2 text-gray-500 dark:text-gray-400 text-xs">{s.reviewNotes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={upgradeMsgOpen} onClose={() => setUpgradeMsgOpen(false)} title={t("subscription.upgradeUnavailable", "Upgrade Unavailable")}>
        <p className="text-sm text-gray-600 dark:text-gray-400">{upgradeMsg}</p>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setUpgradeMsgOpen(false)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export function VendorPortal() {
  const { t } = useTranslation('vendor');
  const [vendorToken, setVendorToken] = useState<string | null>(
    () => localStorage.getItem('vendor_auth_token')
  );
  const [vendorUser, setVendorUser] = useState<VendorUser | null>(null);

  // Validate existing token by loading user from it
  const meQuery = useQuery<VendorUser>({
    queryKey: ['vendor-me', vendorToken],
    queryFn: () =>
      axios.get<{ success: boolean; data: VendorUser }>('/api/vendor-portal/me', {
        headers: { Authorization: `Bearer ${vendorToken}` },
      }).then(r => r.data.data),
    enabled: !!vendorToken && !vendorUser,
    retry: false,
  });

  const resolvedUser: VendorUser | null = vendorUser ?? meQuery.data ?? null;

  const handleAuth = (token: string, user: VendorUser) => {
    localStorage.setItem('vendor_auth_token', token);
    setVendorToken(token);
    setVendorUser(user);
  };

  const handleSignOut = () => {
    localStorage.removeItem('vendor_auth_token');
    setVendorToken(null);
    setVendorUser(null);
  };

  if (vendorToken && !resolvedUser && meQuery.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400 text-sm">{t("portal.loading", "Loading…")}</p>
      </div>
    );
  }

  if (!vendorToken || !resolvedUser || meQuery.isError) {
    return <AuthPanel onAuth={handleAuth} />;
  }

  return <VendorDashboard user={resolvedUser} token={vendorToken} onSignOut={handleSignOut} />;
}
