// Phase 14.2 — UK working-day calculator for the Procurement Act 2023
// standstill clock. PA 2023 Schedule 4 mandates an 8-working-day
// minimum standstill period, defined as days that are not weekends
// AND not English & Welsh public holidays. Scotland and Northern
// Ireland have separate calendars; UK HE procurement law applies
// the England & Wales calendar by default.
//
// Strategy: a small hardcoded set of holiday dates covering 2026–2030.
// Refreshing the table is an annual op task: extend the SUPPORTED_YEARS
// constant alongside the new entries when 2031+ data is published. We
// deliberately don't fetch from the GOV.UK Bank Holidays JSON feed at
// runtime because (a) standstill calculations must be deterministic
// during procurement disputes, (b) the feed is occasionally rate-
// limited, and (c) the dataset is small.
//
// Timezone posture: all classification runs in UTC via getUTC* methods.
// Callers should pass Date objects whose UTC components represent the
// intended UK date (e.g. `new Date(Date.UTC(2026, 4, 25))` for the
// 2026 Spring bank holiday). On servers running outside Europe/London
// this avoids the local-day boundary shifting around the calendar
// — Copilot review on PR #101 flagged the prior local-TZ implementation
// as "UK day can shift and misclassify bank holidays" depending on the
// runtime TZ. UTC is the deterministic floor; if the caller wants
// strict Europe/London semantics (BST/GMT day-shift handling around
// midnight UK), they should normalise the input via Intl.DateTimeFormat
// before calling.
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
  // 2029
  '2029-01-01',
  '2029-03-30', // Good Friday
  '2029-04-02', // Easter Monday
  '2029-05-07',
  '2029-05-28',
  '2029-08-27',
  '2029-12-25',
  '2029-12-26',
  // 2030
  '2030-01-01',
  '2030-04-19', // Good Friday
  '2030-04-22', // Easter Monday
  '2030-05-06',
  '2030-05-27',
  '2030-08-26',
  '2030-12-25',
  '2030-12-26',
]);

const SUPPORTED_YEAR_MIN = 2026;
const SUPPORTED_YEAR_MAX = 2030;

function toIsoDateUtc(d: Date): string {
  // UTC date as YYYY-MM-DD. Using getUTC* keeps the classification
  // deterministic regardless of the runtime TZ — see file header for
  // the rationale.
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function assertSupportedYear(d: Date): void {
  // Phase 14.2 — fail fast for years outside the hardcoded bank
  // holiday table. Silently treating a 2031 New Year's Day as a
  // working day would produce a legally incorrect standstill end
  // date that an aggrieved bidder could challenge under PA 2023
  // s.99 (procurement remedies). Throwing here forces the operator
  // to extend SUPPORTED_YEAR_MAX + the holiday set when the
  // calendar moves past 2030.
  const year = d.getUTCFullYear();
  if (year < SUPPORTED_YEAR_MIN || year > SUPPORTED_YEAR_MAX) {
    throw new RangeError(
      `UK bank holiday table only covers ${SUPPORTED_YEAR_MIN}-${SUPPORTED_YEAR_MAX} (got ${year}). Refresh ENGLAND_AND_WALES_BANK_HOLIDAYS_ISO + SUPPORTED_YEAR_MAX before classifying dates outside that range.`,
    );
  }
}

export function isUkWorkingDay(date: Date): boolean {
  assertSupportedYear(date);
  // 0 = Sunday, 6 = Saturday in both UTC and local-day APIs; UTC keeps
  // it deterministic across timezones.
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !ENGLAND_AND_WALES_BANK_HOLIDAYS_ISO.has(toIsoDateUtc(date));
}

/**
 * Compute the date that is `workingDays` working days after `start`,
 * excluding weekends and English & Welsh bank holidays. The start date
 * itself is NOT counted — the first counted working day is the day
 * AFTER `start`. This matches PA 2023 Schedule 4 framing where the
 * standstill clock begins the day after the Contract Award Notice is
 * dispatched.
 *
 * `start` should carry UTC components representing the intended UK
 * date — see the file header for the timezone posture. Throws if
 * `workingDays` is negative or non-finite, or if any date in the
 * count window falls outside the supported year range.
 */
export function addUkWorkingDays(start: Date, workingDays: number): Date {
  if (!Number.isFinite(workingDays) || workingDays < 0) {
    throw new Error(`addUkWorkingDays: workingDays must be a non-negative finite number (got ${workingDays})`);
  }
  const cursor = new Date(start.getTime());
  let added = 0;
  while (added < workingDays) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
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
