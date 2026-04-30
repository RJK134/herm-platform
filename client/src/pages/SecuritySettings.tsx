import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ShieldCheck, ShieldAlert, AlertCircle, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';

/**
 * Account-security page — Phase 10.8 scaffold UI for TOTP MFA.
 *
 * Three states the user can be in:
 *   1. Not enrolled              → "Enable 2FA" button.
 *   2. Enrolled but not verified → secret + otpauth URI displayed; user
 *                                  enters a TOTP code and we call /verify.
 *   3. Active                    → "Disable 2FA" with a TOTP confirmation.
 *
 * QR rendering is a deliberate follow-up — modern authenticator apps
 * accept the secret string OR the otpauth URI, so for the v1 scaffold
 * we render both as copy-friendly text. A QR rendering library can land
 * in a follow-up PR if customer feedback asks for it.
 */
type Status = { enrolled: boolean; enabled: boolean; enabledAt: string | null };

export function SecuritySettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [enrollment, setEnrollment] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [copied, setCopied] = useState<'secret' | 'uri' | null>(null);

  async function refreshStatus() {
    setLoadError(null);
    try {
      const { data } = await api.getMfaStatus();
      if (data.success && data.data) setStatus(data.data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load MFA status');
    }
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  async function handleEnroll() {
    setIsMutating(true);
    try {
      const { data } = await api.enrollMfa();
      if (data.success && data.data) {
        setEnrollment(data.data);
        setVerifyCode('');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to start MFA enrolment');
    } finally {
      setIsMutating(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setIsMutating(true);
    try {
      await api.verifyMfa(verifyCode);
      toast.success('Two-factor authentication is now enabled');
      setEnrollment(null);
      setVerifyCode('');
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Verification failed');
      setVerifyCode('');
    } finally {
      setIsMutating(false);
    }
  }

  async function handleDisable(e: FormEvent) {
    e.preventDefault();
    setIsMutating(true);
    try {
      await api.disableMfa(disableCode);
      toast.success('Two-factor authentication disabled');
      setDisableCode('');
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to disable MFA');
      setDisableCode('');
    } finally {
      setIsMutating(false);
    }
  }

  async function copy(value: string, kind: 'secret' | 'uri') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  if (status === null && loadError === null) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-heading font-bold text-gray-900 dark:text-white mb-2">
          Account security
        </h1>
        <p className="text-gray-500 dark:text-gray-400">Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-heading font-bold text-gray-900 dark:text-white mb-2">
          Account security
        </h1>
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-gray-900 dark:text-white mb-1">
          Account security
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Manage two-factor authentication for your sign-in.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-3 mb-4">
          {status?.enabled ? (
            <ShieldCheck className="w-6 h-6 text-teal-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
          ) : (
            <ShieldAlert className="w-6 h-6 text-amber-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
          )}
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Two-factor authentication
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              {status?.enabled
                ? `Active since ${status.enabledAt ? new Date(status.enabledAt).toLocaleDateString() : 'unknown'}.`
                : 'Add a second sign-in step using an authenticator app.'}
            </p>
          </div>
        </div>

        {/* State 1 + 2: not yet active. State 2 (enrolment in progress) is
            tracked client-side via `enrollment`. */}
        {!status?.enabled && !enrollment && (
          <button
            type="button"
            onClick={handleEnroll}
            disabled={isMutating}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          >
            {isMutating ? 'Starting…' : 'Enable two-factor authentication'}
          </button>
        )}

        {!status?.enabled && enrollment && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Add this account to your authenticator app, then enter the 6-digit code it shows.
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Secret (manual entry)
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 text-sm font-mono break-all rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                  {enrollment.secret}
                </code>
                <button
                  type="button"
                  onClick={() => copy(enrollment.secret, 'secret')}
                  aria-label="Copy secret"
                  className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {copied === 'secret' ? <Check className="w-4 h-4 text-teal-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                otpauth URI (paste into authenticator)
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 text-xs font-mono break-all rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                  {enrollment.otpauthUri}
                </code>
                <button
                  type="button"
                  onClick={() => copy(enrollment.otpauthUri, 'uri')}
                  aria-label="Copy otpauth URI"
                  className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {copied === 'uri' ? <Check className="w-4 h-4 text-teal-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <form onSubmit={handleVerify} className="space-y-3 pt-2">
              <div>
                <label
                  htmlFor="verify-code"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Authentication code
                </label>
                <input
                  id="verify-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="123 456"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEnrollment(null);
                    setVerifyCode('');
                  }}
                  className="flex-1 py-2 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isMutating || verifyCode.length !== 6}
                  className="flex-[2] py-2 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-medium rounded-lg"
                >
                  {isMutating ? 'Verifying…' : 'Verify and activate'}
                </button>
              </div>
            </form>
          </div>
        )}

        {status?.enabled && (
          <form onSubmit={handleDisable} className="space-y-3 pt-2">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Enter a code from your authenticator app to disable two-factor authentication.
            </p>
            <div>
              <label
                htmlFor="disable-code"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Authentication code
              </label>
              <input
                id="disable-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="123 456"
              />
            </div>
            <button
              type="submit"
              disabled={isMutating || disableCode.length !== 6}
              className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg"
            >
              {isMutating ? 'Disabling…' : 'Disable two-factor authentication'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
