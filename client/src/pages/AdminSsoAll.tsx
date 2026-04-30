/**
 * SUPER_ADMIN cross-institution SSO panel (Phase 11.8).
 *
 * Lists every `SsoIdentityProvider` row in the deployment, with the
 * institution's display name + slug, the protocol, and whether it's
 * enabled. Replaces the impersonation-first workflow where a SUPER_ADMIN
 * had to start a session as the tenant before they could administer
 * the row.
 *
 * Edit / delete flow: rows link to a deep-link edit page
 * (`/admin/sso/institutions/:institutionId`) that re-uses the same form
 * as the institution-scoped /admin/sso page. The deep-link page lives
 * in `AdminSsoForInstitution.tsx`.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ShieldCheck, ShieldOff, AlertCircle, Plus } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Header } from '../components/layout/Header';
import { api, ApiError } from '../lib/api';
import type { SsoIdpListEntry } from '../lib/api';

export function AdminSsoAll() {
  const [rows, setRows] = useState<SsoIdpListEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listAllSsoIdps();
        if (!cancelled) setRows(res.data.data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError ? err.message : 'Failed to load SSO IdP list',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Header
        title="SSO Identity Providers (all institutions)"
        subtitle="SUPER_ADMIN-only cross-institution panel. Edit or delete an IdP row for any institution without impersonating first."
      />
      <div className="mb-6 flex items-center gap-3 text-teal-600 dark:text-teal-400">
        <ShieldCheck className="h-5 w-5" />
        <span className="text-xs font-medium uppercase tracking-wide">Phase 11.8</span>
      </div>

      {loadError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {rows === null && !loadError && <p className="text-sm text-gray-500">Loading…</p>}

      {rows && rows.length === 0 && (
        <Card className="p-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            No SSO IdP rows are provisioned in this deployment yet. To add one,
            navigate to a specific institution&rsquo;s admin URL —{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
              /admin/sso/institutions/&lt;institutionId&gt;
            </code>{' '}
            — or use the existing <Link to="/admin/sso" className="underline">/admin/sso</Link> page
            to administer your own institution.
          </p>
        </Card>
      )}

      {rows && rows.length > 0 && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Institution</th>
                <th className="px-4 py-3">Protocol</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">JIT</th>
                <th className="px-4 py-3">Default role</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      <div>
                        <div className="font-medium">{row.institutionName}</div>
                        <div className="font-mono text-xs text-gray-500 dark:text-gray-400">
                          {row.institutionSlug}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{row.protocol}</td>
                  <td className="px-4 py-3">
                    {row.enabled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <ShieldCheck className="h-3 w-3" /> enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        <ShieldOff className="h-3 w-3" /> disabled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.jitProvisioning ? 'on' : 'off'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.defaultRole}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(row.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/sso/institutions/${encodeURIComponent(row.institutionId)}`}
                      className="text-teal-600 hover:underline dark:text-teal-400"
                    >
                      edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-6 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <Plus className="h-3 w-3" />
        Adding an IdP for a new institution: visit{' '}
        <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
          /admin/sso/institutions/&lt;institutionId&gt;
        </code>{' '}
        directly. The page will surface the empty form and create on save.
      </p>
    </main>
  );
}

export default AdminSsoAll;
