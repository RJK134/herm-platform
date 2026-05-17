import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { PRODUCT } from '../lib/branding';

/**
 * Phase 16.5 — invite-claim page.
 *
 * URL: `/claim?token=<32-byte-random-base64url>`
 *
 * Flow:
 *  1. Fetch the invite shape via GET /api/invites/:token (institution name,
 *     email, role). 404 on unknown / expired / claimed → show error state.
 *  2. Render a form: read-only email + name + new password (12+ chars).
 *  3. POST /api/invites/:token/claim with {name, password} → server creates
 *     the User row + returns a session JWT. We stash the JWT via the
 *     standard AuthProvider channel and redirect to `/`.
 *
 * No tier gating here — anonymous-but-token-bearing is the intended access
 * mode. AuthContext is engaged ONLY after a successful claim so the user
 * lands on the dashboard already signed in.
 */
type InviteShape = {
  email: string;
  role: string;
  institutionName: string;
  expiresAt: string;
};

const ROLE_LABELS: Record<string, string> = {
  VIEWER: 'Viewer',
  EVALUATOR: 'Evaluator',
  PROCUREMENT_LEAD: 'Procurement Lead',
  FINANCE: 'Finance',
  INSTITUTION_ADMIN: 'Institution Admin',
};

export function Claim() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { setSessionFromClaim } = useAuth();

  const [invite, setInvite] = useState<InviteShape | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(true);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError('No invite token in the URL. Ask your admin for the original invite link.');
      setIsLoadingInvite(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await axios.get<{ success: true; data: InviteShape }>(
          `/api/invites/${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        setInvite(data.data);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message;
        setLoadError(msg ?? 'This invite link is invalid, expired, or has already been used.');
      } finally {
        if (!cancelled) setIsLoadingInvite(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (password.length < 12) {
      setSubmitError('Password must be at least 12 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await axios.post<{
        success: true;
        data: {
          token: string;
          user: {
            userId: string;
            email: string;
            name: string;
            role: string;
            institutionId: string;
            institutionName: string;
            tier: 'free' | 'pro' | 'enterprise';
          };
        };
      }>(`/api/invites/${encodeURIComponent(token)}/claim`, { name: name.trim(), password });
      // Stash the JWT + user into AuthProvider state so the dashboard
      // route renders authenticated immediately, no /login bounce.
      setSessionFromClaim(data.data.token, data.data.user);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setSubmitError(msg ?? 'Failed to complete sign-up. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoadingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  if (loadError || !invite) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Invite unavailable</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{loadError}</p>
              </div>
            </div>
            <Link to="/login" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">
              Sign in instead →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-600 mb-4">
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{PRODUCT.name}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            You've been invited to <strong>{invite.institutionName}</strong>
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Set your password</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            Choose a strong password to finish setting up your account.
          </p>

          <div className="flex items-center gap-2 mb-5 p-3 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
            <CheckCircle2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
            <div className="text-xs text-teal-800 dark:text-teal-300">
              <div>
                <strong>{invite.email}</strong> · {ROLE_LABELS[invite.role] ?? invite.role}
              </div>
            </div>
          </div>

          {submitError && (
            <div className="flex items-start gap-3 p-3 mb-5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-400">{submitError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Your name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                maxLength={120}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={12}
                  maxLength={200}
                  className="w-full px-3.5 py-2.5 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="12+ characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Minimum 12 characters. You can change it later in Account security.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting || password.length < 12 || !name.trim()}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Setting up…
                </span>
              ) : (
                'Create my account'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
