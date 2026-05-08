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

describe('isUkWorkingDay', () => {
  it('treats a regular Monday as a working day', () => {
    // 2026-05-11 is a Monday (and not a bank holiday)
    expect(isUkWorkingDay(new Date(2026, 4, 11))).toBe(true);
  });

  it('treats Saturday and Sunday as non-working', () => {
    expect(isUkWorkingDay(new Date(2026, 4, 9))).toBe(false); // Sat
    expect(isUkWorkingDay(new Date(2026, 4, 10))).toBe(false); // Sun
  });

  it('treats Spring bank holiday (2026-05-25) as non-working', () => {
    expect(isUkWorkingDay(new Date(2026, 4, 25))).toBe(false);
  });

  it('treats the Christmas-substitute holiday (2026-12-28) as non-working', () => {
    // Boxing Day 2026 fell on Saturday → substitute Monday 28th
    expect(isUkWorkingDay(new Date(2026, 11, 28))).toBe(false);
  });
});

describe('addUkWorkingDays', () => {
  it('adds 1 working day across a weekend', () => {
    // Friday 2026-05-08 → Monday 2026-05-11
    const result = addUkWorkingDays(new Date(2026, 4, 8), 1);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(4); // May
    expect(result.getDate()).toBe(11);
  });

  it('skips a bank holiday', () => {
    // Start Friday 2026-05-22 → next working day is Tuesday 2026-05-26
    // (Saturday 23, Sunday 24, Bank Holiday Monday 25 all skipped).
    const result = addUkWorkingDays(new Date(2026, 4, 22), 1);
    expect(result.getDate()).toBe(26);
  });

  it('returns the start date unchanged when adding 0 working days', () => {
    const start = new Date(2026, 4, 11);
    const result = addUkWorkingDays(start, 0);
    expect(result.getTime()).toBe(start.getTime());
  });

  it('throws on negative input', () => {
    expect(() => addUkWorkingDays(new Date(), -1)).toThrow();
  });
});

describe('calculatePa2023StandstillEndDate', () => {
  it('lands 8 working days after the notice date when a bank holiday falls in the window', () => {
    // Notice Wed 2026-05-13 → +8 working days with the Spring bank holiday in the window
    // Thu 14, Fri 15, Mon 18, Tue 19, Wed 20, Thu 21, Fri 22, Mon 25 (BH!)
    // → 25 May is Spring BH, so actual counted days are 14,15,18,19,20,21,22,26 = Tue 26 May
    const standstillEnd = calculatePa2023StandstillEndDate(new Date(2026, 4, 13));
    expect(standstillEnd.getDate()).toBe(26);
    expect(standstillEnd.getMonth()).toBe(4); // May
  });

  it('exposes the legally-mandated 8-day constant for callers that need it', () => {
    expect(PA2023_STANDSTILL_WORKING_DAYS).toBe(8);
  });
});
