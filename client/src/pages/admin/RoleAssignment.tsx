import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/layout/Header';
import { api, ApiError } from '../../lib/api';
import type { InstitutionUser } from '../../types';

// Phase 14.8 — Admin → Roles. Lists every user in the calling
// institution and lets the admin promote/demote roles via the existing
// `PATCH /api/institutions/me/users/:id/role` endpoint. UAT report 4.1
// asked for FINANCE / AUDITOR / STAKEHOLDER alongside the existing
// EVALUATOR / PROCUREMENT_LEAD; this UI surfaces all of them.
//
// Self-demotion is prevented by the server (ForbiddenError); the UI
// disables the dropdown for the current user as a fast-feedback echo
// of that rule.

const ASSIGNABLE_ROLES = [
  'VIEWER',
  'STAKEHOLDER',
  'EVALUATOR',
  'AUDITOR',
  'FINANCE',
  'PROCUREMENT_LEAD',
  'INSTITUTION_ADMIN',
] as const;

type AssignableRole = typeof ASSIGNABLE_ROLES[number];

const ROLE_DESCRIPTIONS: Record<AssignableRole, string> = {
  VIEWER: 'Read-only access to capability + system data',
  STAKEHOLDER: 'Read-only access to procurement narrative + scoring',
  EVALUATOR: 'Score systems within an evaluation project',
  AUDITOR: 'Read-only access to audit logs + compliance views',
  FINANCE: 'TCO calculator + cost-comparison surfaces only',
  PROCUREMENT_LEAD: 'Run the full procurement workflow end-to-end',
  INSTITUTION_ADMIN: 'Manage users, SSO, vendors, and all of the above',
};

export function RoleAssignment() {
  const { t } = useTranslation('admin');
  const qc = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ['institution-users'],
    queryFn: () => api.listInstitutionUsers().then(r => r.data.data),
  });

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api.getMe().then(r => r.data.data),
  });

  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.updateUserRole(userId, role).then(r => r.data.data),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['institution-users'] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not update the role. Please try again.');
      }
    },
  });

  const users = usersQuery.data ?? [];
  const meId = meQuery.data?.userId;

  return (
    <div className="space-y-6">
      <Header
        title={t('roles.title', 'Role assignment')}
        subtitle={t(
          'roles.subtitle',
          'Manage who can access which procurement surface in your institution.',
        )}
      />

      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold dark:text-white text-sm">
              {t('roles.aboutTitle', 'About roles')}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t(
                'roles.about',
                'Each role grants access to a specific subset of the platform. Self-demotion is blocked — ask another admin to change your own role.',
              )}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 mt-4 text-xs">
          {ASSIGNABLE_ROLES.map(role => (
            <div key={role} className="flex items-baseline gap-2">
              <dt className="font-mono text-teal-700 dark:text-teal-400 font-semibold">
                {role}
              </dt>
              <dd className="text-gray-600 dark:text-gray-400">
                {ROLE_DESCRIPTIONS[role]}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3 flex items-start gap-3"
        >
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <th scope="col" className="px-4 py-3 font-medium">
                {t('roles.user', 'User')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('roles.email', 'Email')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('roles.currentRole', 'Current role')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('roles.assignRole', 'Assign role')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {usersQuery.isPending && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                  {t('roles.loading', 'Loading users…')}
                </td>
              </tr>
            )}
            {!usersQuery.isPending && users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                  {t('roles.noUsers', 'No users in this institution.')}
                </td>
              </tr>
            )}
            {users.map((user: InstitutionUser) => {
              const isSelf = user.id === meId;
              return (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-medium dark:text-white">
                    {user.name}
                    {isSelf && (
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                        ({t('roles.you', 'you')})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      disabled={isSelf || updateMutation.isPending}
                      aria-label={t('roles.changeRoleFor', 'Change role for {{name}}', { name: user.name }) ?? undefined}
                      onChange={e =>
                        updateMutation.mutate({ userId: user.id, role: e.target.value })
                      }
                      className="text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {ASSIGNABLE_ROLES.map(role => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
