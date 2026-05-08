import { describe, it, expect } from 'vitest';
import {
  isUkWorkingDay,
  addUkWorkingDays,
  calculatePa2023StandstillEndDate,
  PA2023_STANDSTILL_WORKING_DAYS,
} from '../lib/uk-business-days';

// Phase 14.2 — UK working-day calculator regression coverage. The
// PA 2023 standstill clock is the legally-meaningful output of this
// module so the assertions below exercise the boundary conditions
// most likely to be queried during a procurement dispute (weekend
// edges, bank-holiday substitutes, leap years aren't relevant for
// standstill but holidays around them matter).
//
// All Date inputs are constructed via `Date.UTC(...)` so the test
// runs deterministically regardless of the host's local timezone —
// matches the UTC-based classification posture documented in
// uk-business-days.ts (and keeps the tests passing on US-TZ CI
// runners as well as Europe/London developer laptops).

const utc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month, day));

describe('isUkWorkingDay', () => {
  it('treats a regular Monday as a working day', () => {
    // 2026-05-11 is a Monday (and not a bank holiday)
    expect(isUkWorkingDay(utc(2026, 4, 11))).toBe(true);
  });

  it('treats Saturday and Sunday as non-working', () => {
    expect(isUkWorkingDay(utc(2026, 4, 9))).toBe(false); // Sat
    expect(isUkWorkingDay(utc(2026, 4, 10))).toBe(false); // Sun
  });

  it('treats Spring bank holiday (2026-05-25) as non-working', () => {
    expect(isUkWorkingDay(utc(2026, 4, 25))).toBe(false);
  });

  it('treats the Christmas-substitute holiday (2026-12-28) as non-working', () => {
    // Boxing Day 2026 fell on Saturday → substitute Monday 28th
    expect(isUkWorkingDay(utc(2026, 11, 28))).toBe(false);
  });

  it('throws RangeError for years outside the supported holiday table', () => {
    // 2031+ isn't in the table; rather than silently returning true
    // (and potentially producing a legally-incorrect standstill), the
    // function fails fast so the operator extends the dataset.
    expect(() => isUkWorkingDay(utc(2031, 0, 1))).toThrow(RangeError);
    expect(() => isUkWorkingDay(utc(2025, 11, 31))).toThrow(RangeError);
  });
});

describe('addUkWorkingDays', () => {
  it('adds 1 working day across a weekend', () => {
    // Friday 2026-05-08 → Monday 2026-05-11
    const result = addUkWorkingDays(utc(2026, 4, 8), 1);
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(4); // May
    expect(result.getUTCDate()).toBe(11);
  });

  it('skips a bank holiday', () => {
    // Start Friday 2026-05-22 → next working day is Tuesday 2026-05-26
    // (Saturday 23, Sunday 24, Bank Holiday Monday 25 all skipped).
    const result = addUkWorkingDays(utc(2026, 4, 22), 1);
    expect(result.getUTCDate()).toBe(26);
  });

  it('returns the start date unchanged when adding 0 working days', () => {
    const start = utc(2026, 4, 11);
    const result = addUkWorkingDays(start, 0);
    expect(result.getTime()).toBe(start.getTime());
  });

  it('throws on negative input', () => {
    expect(() => addUkWorkingDays(utc(2026, 4, 11), -1)).toThrow();
  });
});

describe('calculatePa2023StandstillEndDate', () => {
  it('skips an in-window bank holiday and lands 8 working days after the notice date', () => {
    // Notice Wed 2026-05-13 → +8 working days with the Spring bank holiday in the window
    // Thu 14, Fri 15, Mon 18, Tue 19, Wed 20, Thu 21, Fri 22, Mon 25 (BH!)
    // → 25 May is Spring BH, so actual counted days are 14,15,18,19,20,21,22,26 = Tue 26 May
    const standstillEnd = calculatePa2023StandstillEndDate(utc(2026, 4, 13));
    expect(standstillEnd.getUTCDate()).toBe(26);
    expect(standstillEnd.getUTCMonth()).toBe(4); // May
  });

  it('exposes the legally-mandated 8-day constant for callers that need it', () => {
    expect(PA2023_STANDSTILL_WORKING_DAYS).toBe(8);
  });
});
