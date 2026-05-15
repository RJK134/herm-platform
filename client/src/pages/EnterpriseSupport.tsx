import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { CheckCircle2, AlertCircle, Loader2, Headphones } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

/**
 * Phase 16.14 — Enterprise dedicated-CSM contact form.
 *
 * Companion to the server endpoint `POST /api/admin/csm-request`.
 * "Dedicated CSM" is a process commitment, not a code feature — this
 * page is the customer's way to open a ticket. Server emails
 * `support@futurehorizons.education` and writes an audit row.
 *
 * Tier gate: applied at the route level via `<RequireTier
 * tiers={['enterprise']}>` in App.tsx; this component assumes the
 * caller is an Enterprise user. The server re-enforces independently.
 */

const TOPIC_LABELS: Record<string, string> = {
  'kickoff':           'Kickoff / onboarding',
  'quarterly-review':  'Quarterly business review',
  'tooling-question':  'Platform / tooling question',
  'roadmap-input':     'Roadmap input',
  'escalation':        'Escalation',
  'other':             'Other',
};

const CONTACT_LABELS: Record<string, string> = {
  'email':      'Email',
  'phone':      'Phone',
  'video-call': 'Video call',
};

export function EnterpriseSupport() {
  const [topic, setTopic] = useState<string>('quarterly-review');
  const [message, setMessage] = useState('');
  const [contactMethod, setContactMethod] = useState('email');
  const [contactDetail, setContactDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok'; notice: string } | { kind: 'err'; error: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setResult(null);
    setSubmitting(true);
    try {
      const { data } = await axios.post<{
        success: true;
        data: { accepted: boolean; notice: string };
      }>('/api/admin/csm-request', {
        topic,
        message,
        preferredContactMethod: contactMethod,
        preferredContactDetail: contactDetail.trim() || undefined,
      });
      setResult({ kind: 'ok', notice: data.data.notice });
      setMessage('');
      setContactDetail('');
    } catch (err: unknown) {
      const apiMsg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      const fallback = err instanceof Error ? err.message : 'Failed to send request';
      setResult({ kind: 'err', error: apiMsg ?? fallback });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Header
        title="Enterprise support"
        subtitle="Reach your Customer Success Manager"
      />

      <Card>
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl tier-accent-bg/10 tier-accent-text flex items-center justify-center flex-shrink-0">
            <Headphones className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Open a Customer Success request
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              The team will pick this up within one business day. Use this form for
              kickoff scheduling, quarterly reviews, escalations, or roadmap input.
              Routine product issues are usually faster via the in-app chat or your
              account email.
            </p>
          </div>
        </div>

        {result?.kind === 'ok' && (
          <div className="flex items-start gap-3 p-3 mb-5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-emerald-800 dark:text-emerald-300">{result.notice}</p>
          </div>
        )}
        {result?.kind === 'err' && (
          <div className="flex items-start gap-3 p-3 mb-5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400">{result.error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Topic
            </label>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {Object.entries(TOPIC_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Message
            </label>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              minLength={20}
              maxLength={2000}
              placeholder="Briefly describe what you'd like help with…"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {message.length} / 2000 characters · minimum 20
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Preferred contact method
              </label>
              <select
                value={contactMethod}
                onChange={(e) => setContactMethod(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {Object.entries(CONTACT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Contact detail <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={contactDetail}
                onChange={(e) => setContactDetail(e.target.value)}
                maxLength={200}
                placeholder={contactMethod === 'phone' ? '+44 …' : 'name@university.ac.uk'}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={submitting || message.trim().length < 20}>
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Sending…
                </span>
              ) : (
                'Send request'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
