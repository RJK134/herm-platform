import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  CreditCard, CheckCircle, XCircle, AlertCircle,
  ExternalLink, Shield, Zap, Building2,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Header } from '../components/layout/Header';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface SubscriptionData {
  tier: 'FREE' | 'PROFESSIONAL' | 'ENTERPRISE';
  status: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    paidAt?: string;
    invoiceUrl?: string;
  }>;
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paidAt?: string;
  invoiceUrl?: string;
}

interface CheckoutResponse {
  configured: boolean;
  url?: string;
  message?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_ORDER: Record<string, number> = { FREE: 0, PROFESSIONAL: 1, ENTERPRISE: 2 };

interface TierFeature {
  feature: string;
  free: string | boolean;
  professional: string | boolean;
  enterprise: string | boolean;
}

const TIER_FEATURES: TierFeature[] = [
  { feature: 'Procurement projects', free: '3', professional: 'Unlimited', enterprise: 'Unlimited' },
  { feature: 'Team workspace members', free: '2', professional: '10', enterprise: 'Unlimited' },
  { feature: 'Capability baskets', free: '3', professional: 'Unlimited', enterprise: 'Unlimited' },
  { feature: 'Document generation', free: '5/mo', professional: 'Unlimited', enterprise: 'Unlimited' },
  { feature: 'TCO calculations', free: '10/mo', professional: 'Unlimited', enterprise: 'Unlimited' },
  { feature: 'Export formats', free: 'PDF', professional: 'PDF + Word', enterprise: 'All formats' },
  { feature: 'Priority support', free: false, professional: true, enterprise: true },
  { feature: 'White-label exports', free: false, professional: false, enterprise: true },
  { feature: 'API access', free: false, professional: false, enterprise: true },
  { feature: 'Dedicated CSM', free: false, professional: false, enterprise: true },
];

const STATUS_COLOURS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  trialing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  past_due: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  succeeded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function FeatureValue({ val }: { val: string | boolean }) {
  if (val === true) return <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />;
  if (val === false) return <XCircle className="w-4 h-4 text-gray-300 dark:text-gray-600 mx-auto" />;
  return <span className="text-xs text-gray-700 dark:text-gray-300 block text-center">{val}</span>;
}

function fmtCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    return `${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`;
  }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function Subscriptions() {
  const { t } = useTranslation("vendor");
  const qc = useQueryClient();
  const [upgradeMsg, setUpgradeMsg] = useState('');
  const [upgradeMsgOpen, setUpgradeMsgOpen] = useState(false);
  const [_cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const subQuery = useQuery<SubscriptionData>({
    queryKey: ['subscription'],
    queryFn: () =>
      axios.get<{ success: boolean; data: SubscriptionData }>('/api/subscriptions/status')
        .then(r => r.data.data),
  });

  const invoicesQuery = useQuery<Payment[]>({
    queryKey: ['invoices'],
    queryFn: () =>
      axios.get<{ success: boolean; data: Payment[] }>('/api/subscriptions/invoices')
        .then(r => r.data.data)
        .catch(() => subQuery.data?.payments ?? []),
    enabled: !!subQuery.data,
  });

  const checkoutMutation = useMutation({
    mutationFn: (tier: string) =>
      axios.post<CheckoutResponse>('/api/subscriptions/checkout', { tier }),
    onSuccess: (res) => {
      if (res.data.configured === false) {
        setUpgradeMsg(res.data.message ?? 'Stripe is not configured. Please contact your platform administrator to set up billing.');
        setUpgradeMsgOpen(true);
      } else if (res.data.url) {
        window.location.href = res.data.url;
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => axios.post('/api/subscriptions/cancel'),
    onSuccess: () => {
      setCancelConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ['subscription'] });
    },
  });

  const sub = subQuery.data;
  const payments = invoicesQuery.data ?? sub?.payments ?? [];
  const currentTier = sub?.tier ?? 'FREE';
  const currentTierRank = TIER_ORDER[currentTier] ?? 0;

  const tierIcon = (t: string) => {
    if (t === 'ENTERPRISE') return <Building2 className="w-5 h-5" />;
    if (t === 'PROFESSIONAL') return <Zap className="w-5 h-5" />;
    return <Shield className="w-5 h-5" />;
  };

  const tierColour = (t: string) => {
    if (t === 'ENTERPRISE') return 'text-purple-600 dark:text-purple-400';
    if (t === 'PROFESSIONAL') return 'text-teal-600 dark:text-teal-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  const handleCancelRequest = () => {
    const confirmed = window.confirm(
      'Are you sure you want to cancel your subscription? You will retain access until the end of the current billing period.'
    );
    if (confirmed) cancelMutation.mutate();
  };

  if (subQuery.isPending) {
    return (
      <div className="space-y-6">
        <Header title={t("subscription.title", "Subscription")} subtitle={t("subscription.subtitle", "Manage your plan and billing")} />
        <p className="text-gray-500 dark:text-gray-400 text-sm">{t("subscription.loading", "Loading…")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header title={t("subscription.title", "Subscription")} subtitle={t("subscription.subtitle", "Manage your plan and billing")} />

      {/* ── Current Plan ──────────────────────────────────────────── */}
      <Card>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-700 ${tierColour(currentTier)}`}>
              {tierIcon(currentTier)}
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("subscription.currentPlan", "Current Plan")}</p>
              <p className={`text-2xl font-bold ${tierColour(currentTier)}`}>{currentTier}</p>
              <div className="flex items-center gap-2 mt-1">
                {sub?.status && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[sub.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {sub.status}
                  </span>
                )}
                {sub?.currentPeriodEnd && sub.status === 'active' && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {t("subscription.renewsOn", "Renews on")} {new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(currentTier === 'PROFESSIONAL' || currentTier === 'ENTERPRISE') && sub?.stripeCustomerId && (
              <a
                href="https://billing.stripe.com/p/login/test"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-teal-600 dark:text-teal-400 border border-teal-300 dark:border-teal-700 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> {t("subscription.manageOnStripe", "Manage on Stripe")}
              </a>
            )}
            {currentTier !== 'FREE' && sub?.status === 'active' && (
              <Button
                variant="secondary"
                className="text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={handleCancelRequest}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? t("subscription.cancelling", "Cancelling…") : t("subscription.cancelSubscription", "Cancel Subscription")}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ── Tier Comparison ───────────────────────────────────────── */}
      <Card>
        <h3 className="font-semibold dark:text-white text-sm mb-4">{t("subscription.planComparison", "Plan Comparison")}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="pb-4 text-left font-medium text-gray-600 dark:text-gray-400 text-xs w-2/5">{t("subscription.feature", "Feature")}</th>
                <th className="pb-4 text-center font-semibold text-xs">
                  <div className="flex flex-col items-center gap-1">
                    <Shield className="w-4 h-4 text-gray-500" />
                    <span className="dark:text-white">{t("subscription.free", "Free")}</span>
                    <span className="font-normal text-gray-400">£0</span>
                    {currentTier === 'FREE' && (
                      <span className="text-xs bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 px-1.5 py-0.5 rounded-full">{t("subscription.current", "Current")}</span>
                    )}
                  </div>
                </th>
                <th className="pb-4 text-center font-semibold text-xs">
                  <div className="flex flex-col items-center gap-1">
                    <Zap className="w-4 h-4 text-teal-500" />
                    <span className="dark:text-white">{t("subscription.professional", "Professional")}</span>
                    <span className="font-normal text-gray-400">£2,500/yr</span>
                    {currentTier === 'PROFESSIONAL' && (
                      <span className="text-xs bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 px-1.5 py-0.5 rounded-full">{t("subscription.current", "Current")}</span>
                    )}
                  </div>
                </th>
                <th className="pb-4 text-center font-semibold text-xs">
                  <div className="flex flex-col items-center gap-1">
                    <Building2 className="w-4 h-4 text-purple-500" />
                    <span className="dark:text-white">{t("subscription.enterprise", "Enterprise")}</span>
                    <span className="font-normal text-gray-400">£8,000/yr</span>
                    {currentTier === 'ENTERPRISE' && (
                      <span className="text-xs bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 px-1.5 py-0.5 rounded-full">{t("subscription.current", "Current")}</span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {TIER_FEATURES.map(row => (
                <tr key={row.feature} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-3 text-gray-700 dark:text-gray-300 text-xs">{row.feature}</td>
                  <td className="py-3"><FeatureValue val={row.free} /></td>
                  <td className="py-3"><FeatureValue val={row.professional} /></td>
                  <td className="py-3"><FeatureValue val={row.enterprise} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Upgrade CTAs */}
        <div className="flex flex-wrap gap-3 mt-6 pt-5 border-t border-gray-100 dark:border-gray-700">
          {currentTier === 'FREE' && (
            <>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-2"
                onClick={() => checkoutMutation.mutate('institutionProfessional')}
                disabled={checkoutMutation.isPending}
              >
                <Zap className="w-4 h-4" />
                {t("subscription.upgradeProfessional", "Upgrade to Professional — £2,500/yr")}
              </Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2"
                onClick={() => checkoutMutation.mutate('institutionEnterprise')}
                disabled={checkoutMutation.isPending}
              >
                <Building2 className="w-4 h-4" />
                {t("subscription.upgradeEnterprise", "Upgrade to Enterprise — £8,000/yr")}
              </Button>
            </>
          )}
          {currentTier === 'PROFESSIONAL' && (
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2"
              onClick={() => checkoutMutation.mutate('institutionEnterprise')}
              disabled={checkoutMutation.isPending}
            >
              <Building2 className="w-4 h-4" />
              {t("subscription.upgradeEnterprise", "Upgrade to Enterprise — £8,000/yr")}
            </Button>
          )}
          {currentTier === 'ENTERPRISE' && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> {t("subscription.onEnterprise", "You are on the Enterprise plan — no upgrades available")}
            </span>
          )}
          {currentTierRank < TIER_ORDER['PROFESSIONAL'] && (
            <p className="w-full text-xs text-gray-400 dark:text-gray-500">
              {t("subscription.moneyBackGuarantee", "All plans include a 30-day money-back guarantee. VAT will be added at the applicable rate.")}
            </p>
          )}
        </div>
      </Card>

      {/* ── Payment History ───────────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <h3 className="font-semibold dark:text-white text-sm">{t("subscription.paymentHistory", "Payment History")}</h3>
        </div>

        {payments.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">{t("subscription.noPaymentHistory", "No payment history yet.")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="pb-2 font-medium">{t("subscription.colDate", "Date")}</th>
                <th className="pb-2 font-medium">{t("subscription.colAmount", "Amount")}</th>
                <th className="pb-2 font-medium">{t("subscription.colStatus", "Status")}</th>
                <th className="pb-2 font-medium">{t("subscription.colInvoice", "Invoice")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-2.5 text-gray-700 dark:text-gray-300">
                    {p.paidAt ? new Date(p.paidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td className="py-2.5 font-medium dark:text-white">
                    {fmtCurrency(p.amount, p.currency)}
                  </td>
                  <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="py-2.5">
                    {p.invoiceUrl ? (
                      <a
                        href={p.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 text-xs"
                      >
                        <ExternalLink className="w-3 h-3" /> {t("subscription.view", "View")}
                      </a>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Upgrade unavailable modal */}
      <Modal open={upgradeMsgOpen} onClose={() => setUpgradeMsgOpen(false)} title={t("subscription.upgradeUnavailable", "Upgrade Unavailable")}>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-600 dark:text-gray-400">{upgradeMsg}</p>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setUpgradeMsgOpen(false)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}
