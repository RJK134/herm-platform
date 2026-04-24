import { useState } from 'react';
import { Save, Check, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

export type InstitutionSize = 'small' | 'medium' | 'large' | 'xlarge';

// Keep this shape aligned with `TcoResult` in TcoCalculator.tsx. Only
// the fields we persist live here — the charts-specific derivations
// stay in the page.
export interface TcoSavePayload {
  systemId: string;
  institutionSize: InstitutionSize;
  studentFte: number;
  staffFte: number;
  horizonYears: number;
  licenceCostYear1: number;
  implementationCost: number;
  internalStaffCost: number;
  trainingCost: number;
  infrastructureCost: number;
  integrationCost: number;
  supportCost: number;
  customDevCost: number;
  totalTco: number;
  annualRunRate: number;
  perStudentCost: number;
}

interface SaveTcoEstimateButtonProps {
  /** Derived by the calculator from its current result + inputs. */
  payload: TcoSavePayload | null;
  /** Optional: label for the system being estimated (used in the modal header). */
  systemName?: string;
}

/**
 * Persistence entry point for the TCO calculator. Renders a "Save
 * estimate" button that opens a small modal collecting a name +
 * optional notes, then POSTs to `/api/tco/estimates`.
 *
 * The server stamps `createdById` + `institutionId` from the JWT, so
 * this component does not send (or need) either field. It does, however,
 * require an authenticated caller — `/api/tco/estimates` is JWT-gated.
 * For anonymous visitors we render a disabled button with an
 * explanatory tooltip rather than leaking them through to a 401.
 */
export function SaveTcoEstimateButton({
  payload,
  systemName,
}: SaveTcoEstimateButtonProps) {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSave = Boolean(payload && name.trim().length > 0 && !saving);

  const reset = () => {
    setName('');
    setNotes('');
    setSavedId(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        institutionSize: payload.institutionSize,
        studentFte: payload.studentFte,
        staffFte: payload.staffFte,
        horizonYears: payload.horizonYears,
        systemId: payload.systemId,
        licenceCostYear1: payload.licenceCostYear1,
        implementationCost: payload.implementationCost,
        internalStaffCost: payload.internalStaffCost,
        trainingCost: payload.trainingCost,
        infrastructureCost: payload.infrastructureCost,
        integrationCost: payload.integrationCost,
        supportCost: payload.supportCost,
        customDevCost: payload.customDevCost,
        totalTco: payload.totalTco,
        annualRunRate: payload.annualRunRate,
        perStudentCost: payload.perStudentCost,
        notes: notes.trim() || undefined,
      };
      const res = await api.saveTcoEstimate(body as unknown as Record<string, unknown>);
      const saved = res.data?.data as { id?: string } | undefined;
      setSavedId(saved?.id ?? 'saved');
    } catch (e: unknown) {
      const msg =
        e instanceof Error && e.message ? e.message : 'Save failed. Please try again.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const disabled = !payload || !isAuthenticated;
  const disabledReason = !isAuthenticated
    ? 'Sign in to save estimates'
    : !payload
      ? 'Run the calculator first'
      : undefined;

  return (
    <>
      <Button
        variant="secondary"
        disabled={disabled}
        title={disabledReason}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Save className="w-4 h-4 mr-1.5" />
        Save estimate
      </Button>

      {open && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={savedId ? 'Estimate saved' : 'Save TCO estimate'}
        >
          {savedId ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <Check className="w-4 h-4" />
                <span className="text-sm font-medium">Your estimate is saved.</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                It's available under your institution in the saved estimates list.
              </p>
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="tco-save-name"
                  className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Estimate name
                  <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                </label>
                <input
                  id="tco-save-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    systemName
                      ? `e.g. ${systemName} — 5yr horizon`
                      : 'e.g. Workday — 25k FTE, 5yr'
                  }
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  maxLength={200}
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="tco-save-notes"
                  className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Notes (optional)
                </label>
                <textarea
                  id="tco-save-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Context, assumptions, override rationale…"
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  rows={3}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
