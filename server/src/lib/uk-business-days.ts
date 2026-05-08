// Phase 14.2 — UK working-day calculator for the Procurement Act 2023
// standstill clock. PA 2023 Schedule 4 mandates an 8-working-day
// minimum standstill period, defined as days that are not weekends
// AND not English & Welsh public holidays. Scotland and Northern
// Ireland have separate calendars; UK HE procurement law applies
// the England & Wales calendar by default.
//
// Strategy: a small hardcoded set of holiday dates covering the UAT
// horizon (2026 – 2028). Refreshing the table is an annual op task.
// We deliberately don't fetch from the GOV.UK Bank Holidays JSON feed
// at runtime because (a) standstill calculations must be deterministic
// during procurement disputes, (b) the feed is occasionally
// rate-limited, and (c) the dataset is small.
//
// Source: https://www.gov.uk/bank-holidays (England and Wales).

const ENGLAND_AND_WALES_BANK_HOLIDAYS_ISO: ReadonlySet<string> = new Set([
  // 2026
  '2026-01-01', // New Year's Day
  '2026-04-03', // Good Friday
  '2026-04-06', // Easter Monday
  '2026-05-04', // Early May bank holiday
  '2026-05-25', // Spring bank holiday
  '2026-08-31', // Summer bank holiday
  '2026-12-25', // Christmas Day
  '2026-12-28', // Boxing Day (substitute, since 26 Dec is Saturday)
  // 2027
  '2027-01-01',
  '2027-03-26', // Good Friday
  '2027-03-29', // Easter Monday
  '2027-05-03',
  '2027-05-31',
  '2027-08-30',
  '2027-12-27', // substitute for Christmas Day on Saturday
  '2027-12-28', // Boxing Day
  // 2028
  '2028-01-03', // substitute for New Year's Day on Saturday
  '2028-04-14', // Good Friday
  '2028-04-17', // Easter Monday
  '2028-05-01',
  '2028-05-29',
  '2028-08-28',
  '2028-12-25',
  '2028-12-26',
]);

function toIsoDate(d: Date): string {
  // Local timezone date as YYYY-MM-DD. We use the date in the caller's
  // wall-clock — if the caller passes a UTC midnight, that's what we
  // compare against. For procurement-clock purposes the contracting
  // authority's local-day boundary is what matters, so callers are
  // expected to construct dates in the relevant timezone before
  // passing them in.
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function isUkWorkingDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // Sunday=0, Saturday=6
  return !ENGLAND_AND_WALES_BANK_HOLIDAYS_ISO.has(toIsoDate(date));
}

/**
 * Compute the date that is `workingDays` working days after `start`,
 * excluding weekends and English & Welsh bank holidays. The start date
 * itself is NOT counted — the first counted working day is the day
 * AFTER `start`. This matches PA 2023 Schedule 4 framing where the
 * standstill clock begins the day after the Contract Award Notice is
 * dispatched.
 *
 * Throws if `workingDays` is negative or non-finite.
 */
export function addUkWorkingDays(start: Date, workingDays: number): Date {
  if (!Number.isFinite(workingDays) || workingDays < 0) {
    throw new Error(`addUkWorkingDays: workingDays must be a non-negative finite number (got ${workingDays})`);
  }
  const cursor = new Date(start.getTime());
  let added = 0;
  while (added < workingDays) {
    cursor.setDate(cursor.getDate() + 1);
    if (isUkWorkingDay(cursor)) added += 1;
  }
  return cursor;
}

/**
 * PA 2023 Schedule 4 standstill = 8 UK working days after the day the
 * Contract Award Notice is sent. Wraps `addUkWorkingDays(start, 8)`
 * for caller-readability.
 */
export const PA2023_STANDSTILL_WORKING_DAYS = 8;

export function calculatePa2023StandstillEndDate(noticeSentDate: Date): Date {
  return addUkWorkingDays(noticeSentDate, PA2023_STANDSTILL_WORKING_DAYS);
}
