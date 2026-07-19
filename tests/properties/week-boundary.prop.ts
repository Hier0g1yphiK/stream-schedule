import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { DayOfWeek } from '../../src/types/index';
import {
  getCurrentWeekId,
  getNextPostingDate,
  hasPostingTimePassed,
} from '../../src/utils/week-calculator';

// Feature: discord-stream-schedule-bot, Property 12: Next posting time computation
// **Validates: Requirements 6.4**

/** All valid DayOfWeek values */
const ALL_DAYS: DayOfWeek[] = [
  DayOfWeek.Monday,
  DayOfWeek.Tuesday,
  DayOfWeek.Wednesday,
  DayOfWeek.Thursday,
  DayOfWeek.Friday,
  DayOfWeek.Saturday,
  DayOfWeek.Sunday,
];

/** Map DayOfWeek to JS Date getUTCDay() values (0=Sunday, 1=Monday, ..., 6=Saturday) */
const DAY_TO_NUMBER: Record<DayOfWeek, number> = {
  [DayOfWeek.Sunday]: 0,
  [DayOfWeek.Monday]: 1,
  [DayOfWeek.Tuesday]: 2,
  [DayOfWeek.Wednesday]: 3,
  [DayOfWeek.Thursday]: 4,
  [DayOfWeek.Friday]: 5,
  [DayOfWeek.Saturday]: 6,
};

/** Arbitrary that generates a valid DayOfWeek */
const dayOfWeekArb = fc.constantFrom(...ALL_DAYS);

/** Arbitrary that generates a valid HH:MM posting time */
const postingTimeArb = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

/** Arbitrary that generates a Date within a reasonable range (2020-2030) */
const dateArb = fc
  .integer({ min: new Date('2020-01-01T00:00:00Z').getTime(), max: new Date('2030-12-31T23:59:59Z').getTime() })
  .map((ts) => new Date(ts));

/**
 * Generates a `from` Date where the posting time has already passed.
 */
const passedPostingTimeArb = fc
  .tuple(dayOfWeekArb, postingTimeArb, dateArb)
  .filter(([postingDay, postingTime, from]) => {
    return hasPostingTimePassed(postingDay, postingTime, from);
  });

/**
 * Generates a `from` Date where the posting time has NOT yet passed.
 */
const notPassedPostingTimeArb = fc
  .tuple(dayOfWeekArb, postingTimeArb, dateArb)
  .filter(([postingDay, postingTime, from]) => {
    return !hasPostingTimePassed(postingDay, postingTime, from);
  });

describe('Property 12: Next posting time computation', () => {
  it('when posting time has already passed, next posting date is at least 1 day and at most 7 days in the future', () => {
    fc.assert(
      fc.property(passedPostingTimeArb, ([postingDay, postingTime, from]) => {
        const nextDate = getNextPostingDate(postingDay, postingTime, from);
        const diffMs = nextDate.getTime() - from.getTime();
        const diffDays = diffMs / (24 * 60 * 60 * 1000);

        expect(diffDays).toBeGreaterThan(0);
        expect(diffDays).toBeLessThanOrEqual(7);
      }),
      { numRuns: 100 }
    );
  });

  it('when posting time has not passed, next posting date is within the current week (0 to 7 days ahead)', () => {
    fc.assert(
      fc.property(notPassedPostingTimeArb, ([postingDay, postingTime, from]) => {
        const nextDate = getNextPostingDate(postingDay, postingTime, from);
        const diffMs = nextDate.getTime() - from.getTime();
        const diffDays = diffMs / (24 * 60 * 60 * 1000);

        expect(diffDays).toBeGreaterThan(0);
        expect(diffDays).toBeLessThanOrEqual(7);
      }),
      { numRuns: 100 }
    );
  });

  it('next posting date always falls on the configured posting day', () => {
    fc.assert(
      fc.property(dayOfWeekArb, postingTimeArb, dateArb, (postingDay, postingTime, from) => {
        const nextDate = getNextPostingDate(postingDay, postingTime, from);
        const expectedDayNum = DAY_TO_NUMBER[postingDay];
        const actualDayNum = nextDate.getUTCDay();

        expect(actualDayNum).toBe(expectedDayNum);
      }),
      { numRuns: 100 }
    );
  });

  it('next posting date always has the configured posting time (hours and minutes match)', () => {
    fc.assert(
      fc.property(dayOfWeekArb, postingTimeArb, dateArb, (postingDay, postingTime, from) => {
        const nextDate = getNextPostingDate(postingDay, postingTime, from);
        const [expectedHours, expectedMinutes] = postingTime.split(':').map(Number);

        expect(nextDate.getUTCHours()).toBe(expectedHours);
        expect(nextDate.getUTCMinutes()).toBe(expectedMinutes);
        expect(nextDate.getUTCSeconds()).toBe(0);
        expect(nextDate.getUTCMilliseconds()).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});


// Feature: discord-stream-schedule-bot, Property 6: Week boundary assignment
// **Validates: Requirements 4.1, 4.5**

/**
 * Compute the ISO 8601 week data for a date (mirrors implementation logic).
 */
function getISOWeekData(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

/**
 * Format an ISO week identifier string: YYYY-Www
 */
function formatWeekId(year: number, week: number): string {
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

/**
 * Given a posting day and a reference date, compute the posting Date for the same
 * relative week (mirrors the implementation's getPostingDateForCurrentCycle).
 */
function computePostingDateForWeek(postingDay: DayOfWeek, postingTime: string, from: Date): Date {
  const [h, m] = postingTime.split(':').map(Number);
  const targetDayNum = DAY_TO_NUMBER[postingDay];
  const currentDayNum = from.getUTCDay();
  const dayDiff = targetDayNum - currentDayNum;

  return new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate() + dayDiff,
    h,
    m,
    0,
    0,
  ));
}

/**
 * Generate a scenario where `now` is strictly before the posting time on the posting day.
 * We pick the posting day's date and set a time earlier than postingTime.
 */
const beforePostingTimeArb = fc.tuple(dayOfWeekArb, postingTimeArb, dateArb).chain(([postingDay, postingTime, refDate]) => {
  const postingDate = computePostingDateForWeek(postingDay, postingTime, refDate);
  const postingTs = postingDate.getTime();

  // Start of the posting day (00:00 UTC)
  const startOfPostingDay = new Date(Date.UTC(
    postingDate.getUTCFullYear(),
    postingDate.getUTCMonth(),
    postingDate.getUTCDate(),
    0, 0, 0, 0,
  ));

  const minTs = startOfPostingDay.getTime();
  const maxTs = postingTs - 1; // 1ms before posting time

  if (minTs > maxTs) {
    // Posting time is 00:00, so there's no "before" on the same day.
    // Use the day before at any time as "before posting time" scenario.
    const dayBeforeEnd = new Date(minTs - 1);
    const dayBeforeStart = new Date(minTs - 24 * 60 * 60 * 1000);
    return fc.integer({ min: dayBeforeStart.getTime(), max: dayBeforeEnd.getTime() }).map((ts) => ({
      postingDay,
      postingTime,
      now: new Date(ts),
    }));
  }

  return fc.integer({ min: minTs, max: maxTs }).map((ts) => ({
    postingDay,
    postingTime,
    now: new Date(ts),
  }));
});

/**
 * Generate a scenario where `now` is at or after the posting time on the posting day.
 */
const atOrAfterPostingTimeArb = fc.tuple(dayOfWeekArb, postingTimeArb, dateArb).chain(([postingDay, postingTime, refDate]) => {
  const postingDate = computePostingDateForWeek(postingDay, postingTime, refDate);
  const postingTs = postingDate.getTime();

  // End of posting day (23:59:59.999 UTC)
  const endOfPostingDay = new Date(Date.UTC(
    postingDate.getUTCFullYear(),
    postingDate.getUTCMonth(),
    postingDate.getUTCDate(),
    23, 59, 59, 999,
  ));

  const maxTs = endOfPostingDay.getTime();

  return fc.integer({ min: postingTs, max: maxTs }).map((ts) => ({
    postingDay,
    postingTime,
    now: new Date(ts),
  }));
});

describe('Property 6: Week boundary assignment', () => {
  it('before posting time on posting day → getCurrentWeekId returns the current week (same as posting date ISO week)', () => {
    fc.assert(
      fc.property(beforePostingTimeArb, ({ postingDay, postingTime, now }) => {
        const weekId = getCurrentWeekId(postingDay, postingTime, now);

        // The posting date for this cycle defines the current week
        const postingDate = computePostingDateForWeek(postingDay, postingTime, now);
        const { year, week } = getISOWeekData(postingDate);
        const expectedWeekId = formatWeekId(year, week);

        expect(weekId).toBe(expectedWeekId);
      }),
      { numRuns: 100 },
    );
  });

  it('at or after posting time on posting day → getCurrentWeekId returns the next week', () => {
    fc.assert(
      fc.property(atOrAfterPostingTimeArb, ({ postingDay, postingTime, now }) => {
        const weekId = getCurrentWeekId(postingDay, postingTime, now);

        // The posting date for this cycle + 7 days defines the next week
        const postingDate = computePostingDateForWeek(postingDay, postingTime, now);
        const nextPostingDate = new Date(postingDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        const { year, week } = getISOWeekData(nextPostingDate);
        const expectedWeekId = formatWeekId(year, week);

        expect(weekId).toBe(expectedWeekId);
      }),
      { numRuns: 100 },
    );
  });

  it('hasPostingTimePassed and getCurrentWeekId are consistent: false → current week, true → next week', () => {
    fc.assert(
      fc.property(dayOfWeekArb, postingTimeArb, dateArb, (postingDay, postingTime, now) => {
        const passed = hasPostingTimePassed(postingDay, postingTime, now);
        const weekId = getCurrentWeekId(postingDay, postingTime, now);

        const postingDate = computePostingDateForWeek(postingDay, postingTime, now);

        if (!passed) {
          // When posting time has NOT passed, weekId matches the posting date's week
          const { year, week } = getISOWeekData(postingDate);
          expect(weekId).toBe(formatWeekId(year, week));
        } else {
          // When posting time HAS passed, weekId matches next posting date's week
          const nextPostingDate = new Date(postingDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          const { year, week } = getISOWeekData(nextPostingDate);
          expect(weekId).toBe(formatWeekId(year, week));
        }
      }),
      { numRuns: 100 },
    );
  });
});
