import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { PRODUCT } from '../lib/branding';

/**
 * Returns the path if it's a safe same-origin route, otherwise null.
 * Rejects protocol-relative URLs (`//foo`), absolute URLs (`http://…`),
 * `javascript:`/`data:` schemes, and anything that doesn't start with `/`.
 */
function safeInternalPath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith('/')) return null;
  if (path.startsWith('//') || path.startsWith('/\\')) return null;
  return path;
}

export function Login() {
  const { login, loginMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Post-login destination can come from two sources:
  //   1. <Navigate state={{from}}> — set by <ProtectedRoute> client-side
  //   2. ?returnTo=<path> — set by the axios 401 interceptor (window.location.href)
  // Prefer the state-based source, fall back to the query param, then '/'.
  // Both are passed through `safeInternalPath` to prevent open-redirects
  // like `?returnTo=//evil.com` (protocol-relative) or `?returnTo=javascript:…`.
  const rawFrom =
    (location.state as { from?: string })?.from ??
    new URLSearchParams(location.search).get('returnTo');
  const from = safeInternalPath(rawFrom) ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phase 10.8 — MFA challenge state. Non-null when the password step
  // returned a `requiresMfa` envelope; the second form is rendered until
  // the user submits a TOTP code or hits Cancel.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  function extractAxiosMessage(err: unknown): string | null {
    return (err as { response?: { data?: { error?: { message?: string } } } })
      ?.response?.data?.error?.message ?? null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const result = await login(email, password);
      if (result.type === 'mfa_required') {
        setChallengeToken(result.challengeToken);
        return;
      }
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(extractAxiosMessage(err) ?? message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!challengeToken) return;
    setError(null);
    setIsLoading(true);
    try {
      await loginMfa(challengeToken, mfaCode);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed. Try again.';
      setError(extractAxiosMessage(err) ?? message);
      // Common case: a stale code. Keep the challenge token (server has
      // a 5-minute window) so the user can retry without re-entering the
      // password. Clearing the input lets them just type the next code.
      setMfaCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const cancelMfa = () => {
    setChallengeToken(null);
    setMfaCode('');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-600 mb-4">
            <LogIn className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {PRODUCT.name}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            UCISA HERM v3.1 Procurement Intelligence
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
            {challengeToken ? 'Two-factor authentication' : 'Sign in to your account'}
          </h2>

          {error && (
            <div className="flex items-start gap-3 p-3 mb-5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {challengeToken ? (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <ShieldCheck className="w-4 h-4 text-teal-600 flex-shrink-0" aria-hidden="true" />
                <span>Enter the 6-digit code from your authenticator app.</span>
              </div>
              <div>
                <label
                  htmlFor="mfa-code"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Authentication code
                </label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition tracking-widest font-mono"
                  placeholder="123 456"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelMfa}
                  className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || mfaCode.length !== 6}
                  className="flex-[2] py-2.5 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                >
                  {isLoading ? 'Verifying…' : 'Verify and sign in'}
                </button>
              </div>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                placeholder="you@university.ac.uk"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
          )}

          {!challengeToken && (
          <div className="mt-5 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
              Demo credentials
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-300">
              demo@demo-university.ac.uk / demo12345
            </p>
          </div>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          Don't have an account?{' '}
          <Link
            to="/register"
            className="text-teal-600 hover:text-teal-700 font-medium"
          >
            Create one free
          </Link>
        </p>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
          Continue without account —{' '}
          <Link to="/" className="hover:underline">
            browse as guest
          </Link>
        </p>
      </div>
    </div>
  );
}
