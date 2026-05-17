/**
 * SUPER_ADMIN deep-link edit page for one institution's SSO IdP row
 * (Phase 11.8). Mirrors the institution-scoped `AdminSso.tsx` form,
 * but talks to `/api/admin/sso/institutions/:institutionId` so a
 * SUPER_ADMIN can administer any tenant without impersonating first.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Trash2, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Header } from '../components/layout/Header';
import { api, ApiError } from '../lib/api';
import type { SsoIdpListEntry, SsoIdpUpsertPayload } from '../lib/api';

type Protocol = 'SAML' | 'OIDC';
type DefaultRole = 'VIEWER' | 'EVALUATOR' | 'PROCUREMENT_LEAD' | 'INSTITUTION_ADMIN';

interface FormState {
  protocol: Protocol;
  displayName: string;
  enabled: boolean;
  jitProvisioning: boolean;
  defaultRole: DefaultRole;
  samlEntityId: string;
  samlSsoUrl: string;
  samlCert: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
}

const EMPTY_FORM: FormState = {
  protocol: 'OIDC',
  displayName: '',
  enabled: false,
  jitProvisioning: true,
  defaultRole: 'VIEWER',
  samlEntityId: '',
  samlSsoUrl: '',
  samlCert: '',
  oidcIssuer: '',
  oidcClientId: '',
  oidcClientSecret: '',
};

function formFromIdp(idp: SsoIdpListEntry): FormState {
  return {
    protocol: idp.protocol,
    displayName: idp.displayName,
    enabled: idp.enabled,
    jitProvisioning: idp.jitProvisioning,
    defaultRole: idp.defaultRole,
    samlEntityId: idp.samlEntityId ?? '',
    samlSsoUrl: idp.samlSsoUrl ?? '',
    samlCert: '',
    oidcIssuer: idp.oidcIssuer ?? '',
    oidcClientId: idp.oidcClientId ?? '',
    oidcClientSecret: '',
  };
}

export function AdminSsoForInstitution() {
  const { institutionId = '' } = useParams<{ institutionId: string }>();
  const navigate = useNavigate();
  const [idp, setIdp] = useState<SsoIdpListEntry | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.getSsoIdpForInstitution(institutionId);
      const data = res.data.data ?? null;
      setIdp(data);
      setForm(data ? formFromIdp(data) : EMPTY_FORM);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load SSO config');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Phase 16 lint paydown — `refresh()` calls setState synchronously
    // on its first lines, which React 19's react-hooks/set-state-in-effect
    // flags. queueMicrotask defers it past the render commit.
    if (institutionId) queueMicrotask(() => void refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: SsoIdpUpsertPayload = {
        protocol: form.protocol,
        displayName: form.displayName,
        enabled: form.enabled,
        jitProvisioning: form.jitProvisioning,
        defaultRole: form.defaultRole,
      };
      if (form.protocol === 'SAML') {
        payload.samlEntityId = form.samlEntityId.trim() || null;
        payload.samlSsoUrl = form.samlSsoUrl.trim() || null;
        if (form.samlCert.trim()) payload.samlCert = form.samlCert.trim();
        payload.oidcIssuer = null;
        payload.oidcClientId = null;
      } else {
        payload.oidcIssuer = form.oidcIssuer.trim() || null;
        payload.oidcClientId = form.oidcClientId.trim() || null;
        if (form.oidcClientSecret.trim()) payload.oidcClientSecret = form.oidcClientSecret.trim();
        payload.samlEntityId = null;
        payload.samlSsoUrl = null;
      }
      const res = await api.upsertSsoIdpForInstitution(institutionId, payload);
      toast.success('SSO configuration saved');
      const saved = res.data.data;
      setIdp(saved);
      setForm(formFromIdp(saved));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function onClearSecret(field: 'samlCert' | 'oidcClientSecret') {
    if (!confirm(`Clear the stored ${field}? The IdP flow will fail until a new value is set.`)) {
      return;
    }
    try {
      const res = await api.upsertSsoIdpForInstitution(institutionId, { [field]: null });
      toast.success(`${field} cleared`);
      setIdp(res.data.data);
      setForm(formFromIdp(res.data.data));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to clear');
    }
  }

  async function onDelete() {
    if (!confirm("Delete this institution's IdP row? Users will fall back to password login.")) {
      return;
    }
    try {
      await api.deleteSsoIdpForInstitution(institutionId);
      toast.success('SSO IdP deleted');
      navigate('/admin/sso/all');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete');
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        to="/admin/sso/all"
        className="mb-4 inline-flex items-center gap-1 text-sm text-teal-600 hover:underline dark:text-teal-400"
      >
        <ArrowLeft className="h-4 w-4" /> Back to all IdPs
      </Link>
      <Header
        title={idp ? `SSO — ${idp.institutionName}` : 'SSO — new institution'}
        subtitle={
          idp
            ? `Editing ${idp.institutionSlug} (${idp.protocol}, ${idp.enabled ? 'enabled' : 'disabled'}).`
            : 'No IdP yet for this institutionId. Pick a protocol below and save to create one.'
        }
      />
      <div className="mb-6 flex items-center gap-3 text-teal-600 dark:text-teal-400">
        <ShieldCheck className="h-5 w-5" />
        <span className="text-xs font-medium uppercase tracking-wide">Phase 11.8 (SUPER_ADMIN)</span>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {loadError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {!loading && (
        <Card className="space-y-6 p-6">
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Protocol</span>
                <select
                  className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                  value={form.protocol}
                  onChange={(e) => setForm((s) => ({ ...s, protocol: e.target.value as Protocol }))}
                >
                  <option value="OIDC">OIDC</option>
                  <option value="SAML">SAML</option>
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium">Display name</span>
                <input
                  type="text"
                  required
                  className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                  value={form.displayName}
                  onChange={(e) => setForm((s) => ({ ...s, displayName: e.target.value }))}
                  maxLength={120}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
                />
                <span>Enabled</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.jitProvisioning}
                  onChange={(e) => setForm((s) => ({ ...s, jitProvisioning: e.target.checked }))}
                />
                <span>JIT provisioning</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <span>Default role:</span>
                <select
                  className="rounded-md border border-gray-300 bg-white p-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                  value={form.defaultRole}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, defaultRole: e.target.value as DefaultRole }))
                  }
                >
                  <option value="VIEWER">VIEWER</option>
                  <option value="EVALUATOR">EVALUATOR</option>
                  <option value="PROCUREMENT_LEAD">PROCUREMENT_LEAD</option>
                  <option value="INSTITUTION_ADMIN">INSTITUTION_ADMIN</option>
                </select>
              </label>
            </div>

            {form.protocol === 'SAML' ? (
              <fieldset className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <legend className="text-sm font-semibold">SAML</legend>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">IdP entityID</span>
                  <input
                    type="text"
                    className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    value={form.samlEntityId}
                    onChange={(e) => setForm((s) => ({ ...s, samlEntityId: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">IdP SSO URL</span>
                  <input
                    type="url"
                    className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    value={form.samlSsoUrl}
                    onChange={(e) => setForm((s) => ({ ...s, samlSsoUrl: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 flex items-center justify-between font-medium">
                    <span>IdP signing cert (PEM)</span>
                    {idp?.hasSamlCert && (
                      <span className="flex items-center gap-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                        <KeyRound className="h-3 w-3" /> stored — leave blank to keep
                        <button
                          type="button"
                          onClick={() => onClearSecret('samlCert')}
                          className="text-red-600 underline-offset-2 hover:underline dark:text-red-400"
                        >
                          clear
                        </button>
                      </span>
                    )}
                  </span>
                  <textarea
                    rows={6}
                    className="w-full rounded-md border border-gray-300 bg-white p-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-900"
                    value={form.samlCert}
                    onChange={(e) => setForm((s) => ({ ...s, samlCert: e.target.value }))}
                    placeholder={'-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----'}
                  />
                </label>
              </fieldset>
            ) : (
              <fieldset className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <legend className="text-sm font-semibold">OIDC</legend>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Issuer URL</span>
                  <input
                    type="url"
                    className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    value={form.oidcIssuer}
                    onChange={(e) => setForm((s) => ({ ...s, oidcIssuer: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Client ID</span>
                  <input
                    type="text"
                    className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    value={form.oidcClientId}
                    onChange={(e) => setForm((s) => ({ ...s, oidcClientId: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 flex items-center justify-between font-medium">
                    <span>Client secret</span>
                    {idp?.hasOidcClientSecret && (
                      <span className="flex items-center gap-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                        <KeyRound className="h-3 w-3" /> stored — leave blank to keep
                        <button
                          type="button"
                          onClick={() => onClearSecret('oidcClientSecret')}
                          className="text-red-600 underline-offset-2 hover:underline dark:text-red-400"
                        >
                          clear
                        </button>
                      </span>
                    )}
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    value={form.oidcClientSecret}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, oidcClientSecret: e.target.value }))
                    }
                  />
                </label>
              </fieldset>
            )}

            <div className="flex items-center justify-between border-t border-gray-200 pt-4 dark:border-gray-700">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : idp ? 'Save changes' : 'Create IdP'}
              </Button>
              {idp && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete IdP row
                </button>
              )}
            </div>
          </form>
        </Card>
      )}
    </main>
  );
}

export default AdminSsoForInstitution;
