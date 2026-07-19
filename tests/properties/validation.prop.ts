import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateTime, validateEntry } from '../../src/utils/validators';

// Feature: discord-stream-schedule-bot, Property 5: Schedule entry validation
// **Validates: Requirements 4.2, 4.6**

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Arbitrary that produces a valid day name (case-insensitive variations).
 */
const validDayArb = fc.constantFrom(...VALID_DAYS).chain((day) =>
  fc.constantFrom(
    day,
    day.toLowerCase(),
    day.toUpperCase(),
    day.charAt(0).toUpperCase() + day.slice(1).toLowerCase()
  )
);

/**
 * Arbitrary that produces a valid HH:MM time string.
 */
const validTimeArb = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

/**
 * Arbitrary that produces a valid title (1-100 characters).
 */
const validTitleArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.length >= 1);

/**
 * Arbitrary that produces an invalid day string (not one of the seven day names).
 */
const invalidDayArb = fc
  .string({ minLength: 1 })
  .filter((s) => !VALID_DAYS.some((d) => d.toLowerCase() === s.toLowerCase()));

/**
 * Arbitrary that produces an invalid time string.
 * Generates strings that do NOT match HH:MM with valid ranges.
 */
const invalidTimeArb = fc.oneof(
  // Random strings that won't match HH:MM pattern
  fc.string({ minLength: 0, maxLength: 10 }).filter((s) => !/^\d{2}:\d{2}$/.test(s)),
  // Valid-looking format but invalid hour (24-99)
  fc
    .tuple(fc.integer({ min: 24, max: 99 }), fc.integer({ min: 0, max: 59 }))
    .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`),
  // Valid-looking format but invalid minute (60-99)
  fc
    .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 60, max: 99 }))
    .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
);

/**
 * Arbitrary that produces an invalid title (empty or >100 chars).
 */
const invalidTitleArb = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 101, maxLength: 200 })
);

describe('Property 5: Schedule entry validation', () => {
  it('a fully valid entry (valid day + valid time + valid title 1-100 chars) is always accepted', () => {
    fc.assert(
      fc.property(validDayArb, validTimeArb, validTitleArb, (day, time, title) => {
        const result = validateEntry(day, time, title);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('an invalid day with valid time and title is always rejected', () => {
    fc.assert(
      fc.property(invalidDayArb, validTimeArb, validTitleArb, (day, time, title) => {
        const result = validateEntry(day, time, title);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  it('a valid day with invalid time and valid title is always rejected', () => {
    fc.assert(
      fc.property(validDayArb, invalidTimeArb, validTitleArb, (day, time, title) => {
        const result = validateEntry(day, time, title);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  it('a valid day with valid time but invalid title (empty or >100 chars) is always rejected', () => {
    fc.assert(
      fc.property(validDayArb, validTimeArb, invalidTitleArb, (day, time, title) => {
        const result = validateEntry(day, time, title);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  it('error message indicates which field failed', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Invalid day case
          fc.tuple(invalidDayArb, validTimeArb, validTitleArb).map(([d, t, ti]) => ({
            day: d,
            time: t,
            title: ti,
            expectedPrefix: 'Day:',
          })),
          // Invalid time case (valid day)
          fc.tuple(validDayArb, invalidTimeArb, validTitleArb).map(([d, t, ti]) => ({
            day: d,
            time: t,
            title: ti,
            expectedPrefix: 'Time:',
          })),
          // Invalid title case (valid day + valid time)
          fc.tuple(validDayArb, validTimeArb, invalidTitleArb).map(([d, t, ti]) => ({
            day: d,
            time: t,
            title: ti,
            expectedPrefix: 'Title:',
          }))
        ),
        ({ day, time, title, expectedPrefix }) => {
          const result = validateEntry(day, time, title);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error!.startsWith(expectedPrefix)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// Feature: discord-stream-schedule-bot, Property 2: Time format validation
// **Validates: Requirements 3.1, 3.3**

describe('Property 2: Time format validation', () => {
  it('valid times (HH in 0-23, MM in 0-59) should always be accepted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (hours, minutes) => {
          const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          const result = validateTime(timeStr);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('invalid hours (24-99) with valid minutes should always be rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 24, max: 99 }),
        fc.integer({ min: 0, max: 59 }),
        (hours, minutes) => {
          const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          const result = validateTime(timeStr);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('invalid minutes (60-99) with valid hours should always be rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 60, max: 99 }),
        (hours, minutes) => {
          const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          const result = validateTime(timeStr);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('arbitrary strings that do not match HH:MM pattern should be rejected', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (input) => {
          // Skip strings that happen to be valid HH:MM times
          const timeRegex = /^\d{2}:\d{2}$/;
          if (timeRegex.test(input)) {
            const [hh, mm] = input.split(':').map(Number);
            if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
              return;
            }
          }
          const result = validateTime(input);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
