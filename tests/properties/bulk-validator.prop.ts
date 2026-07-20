import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateBulkEntries } from '../../src/utils/bulk-validator';
import { ParsedEntry } from '../../src/utils/bulk-parser';
import { DayOfWeek } from '../../src/types';

// Feature: bulk-schedule-command, Property 4: Validation Error Accumulation
// Feature: bulk-schedule-command, Property 5: Case-Insensitive Day Normalization
// Feature: bulk-schedule-command, Property 6: Entry Line Count Limit

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Arbitrary that produces a valid HH:MM time string.
 */
const validTimeArb = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

/**
 * Arbitrary that produces a valid title (1-100 printable chars, no newlines).
 */
const validTitleArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length >= 1 && !s.includes('\n') && !s.includes('\r'));

/**
 * Arbitrary that produces an invalid day string (not one of the seven day names).
 */
const invalidDayArb = fc
  .stringOf(fc.char(), { minLength: 1, maxLength: 15 })
  .filter((s) => !VALID_DAYS.some((d) => d.toLowerCase() === s.toLowerCase()));

/**
 * Arbitrary that produces an invalid time string.
 */
const invalidTimeArb = fc.oneof(
  // Random strings that won't match HH:MM pattern
  fc.stringOf(fc.char(), { minLength: 1, maxLength: 10 }).filter((s) => !/^\d{2}:\d{2}$/.test(s)),
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
  fc.string({ minLength: 101, maxLength: 150 })
);

// Feature: bulk-schedule-command, Property 4: Validation Error Accumulation
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
describe('Property 4: Validation Error Accumulation', () => {
  it('reports an error for every invalid field across all entries', () => {
    // Generate between 1 and 20 entries, each with a random combination of valid/invalid fields
    const entryWithInvalidFieldsArb = fc.record({
      dayValid: fc.boolean(),
      timeValid: fc.boolean(),
      titleValid: fc.boolean(),
    }).filter(({ dayValid, timeValid, titleValid }) => {
      // Ensure at least one field is invalid
      return !(dayValid && timeValid && titleValid);
    }).chain(({ dayValid, timeValid, titleValid }) => {
      const dayArb = dayValid ? fc.constantFrom(...VALID_DAYS) : invalidDayArb;
      const timeArb = timeValid ? validTimeArb : invalidTimeArb;
      const titleArb = titleValid ? validTitleArb : invalidTitleArb;
      return fc.tuple(dayArb, timeArb, titleArb, fc.constant({ dayValid, timeValid, titleValid }));
    });

    fc.assert(
      fc.property(
        fc.array(entryWithInvalidFieldsArb, { minLength: 1, maxLength: 20 }),
        (entries) => {
          const parsedEntries: ParsedEntry[] = entries.map(([day, time, title], idx) => ({
            day,
            startTime: time,
            title,
            lineNumber: idx + 1,
          }));

          const result = validateBulkEntries(parsedEntries);

          // Count the expected number of invalid fields
          const expectedErrorCount = entries.reduce((count, [, , , flags]) => {
            let fieldErrors = 0;
            if (!flags.dayValid) fieldErrors++;
            if (!flags.timeValid) fieldErrors++;
            if (!flags.titleValid) fieldErrors++;
            return count + fieldErrors;
          }, 0);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBe(expectedErrorCount);

          // Verify each error references the correct 1-based line number
          for (const error of result.errors) {
            expect(error.lineNumber).toBeGreaterThanOrEqual(1);
            expect(error.lineNumber).toBeLessThanOrEqual(entries.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each error references the correct 1-based line number of its entry', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(invalidDayArb, validTimeArb, validTitleArb),
          { minLength: 1, maxLength: 20 }
        ),
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 5 }),
        (invalidEntries, lineNumbers) => {
          // Use unique ascending line numbers
          const uniqueLines = [...new Set(lineNumbers)].sort((a, b) => a - b).slice(0, invalidEntries.length);
          const entriesToUse = invalidEntries.slice(0, uniqueLines.length);

          const parsedEntries: ParsedEntry[] = entriesToUse.map(([day, time, title], idx) => ({
            day,
            startTime: time,
            title,
            lineNumber: uniqueLines[idx],
          }));

          const result = validateBulkEntries(parsedEntries);

          // Each error should have a lineNumber matching one of our entries
          for (const error of result.errors) {
            expect(uniqueLines).toContain(error.lineNumber);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: bulk-schedule-command, Property 5: Case-Insensitive Day Normalization
// **Validates: Requirements 3.5**
describe('Property 5: Case-Insensitive Day Normalization', () => {
  /**
   * Arbitrary that produces a valid day name in a random case combination.
   */
  const randomCaseDayArb = fc.constantFrom(...VALID_DAYS).chain((day) =>
    fc.array(fc.boolean(), { minLength: day.length, maxLength: day.length }).map((caseMask) =>
      day
        .split('')
        .map((ch, i) => (caseMask[i] ? ch.toUpperCase() : ch.toLowerCase()))
        .join('')
    )
  );

  it('accepts any valid day name regardless of case and normalizes to DayOfWeek enum', () => {
    fc.assert(
      fc.property(randomCaseDayArb, validTimeArb, validTitleArb, (day, time, title) => {
        const entry: ParsedEntry = {
          day,
          startTime: time,
          title,
          lineNumber: 1,
        };

        const result = validateBulkEntries([entry]);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.normalizedEntries).toHaveLength(1);

        // The normalized day should be the canonical DayOfWeek enum value
        const expectedDay = VALID_DAYS.find(
          (d) => d.toLowerCase() === day.toLowerCase()
        ) as DayOfWeek;
        expect(result.normalizedEntries[0].day).toBe(expectedDay);
      }),
      { numRuns: 100 }
    );
  });

  it('normalizes multiple entries with mixed-case days correctly', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(randomCaseDayArb, validTimeArb, validTitleArb),
          { minLength: 1, maxLength: 20 }
        ),
        (entries) => {
          const parsedEntries: ParsedEntry[] = entries.map(([day, time, title], idx) => ({
            day,
            startTime: time,
            title,
            lineNumber: idx + 1,
          }));

          const result = validateBulkEntries(parsedEntries);

          expect(result.valid).toBe(true);
          expect(result.normalizedEntries).toHaveLength(entries.length);

          for (let i = 0; i < entries.length; i++) {
            const expectedDay = VALID_DAYS.find(
              (d) => d.toLowerCase() === entries[i][0].toLowerCase()
            ) as DayOfWeek;
            expect(result.normalizedEntries[i].day).toBe(expectedDay);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: bulk-schedule-command, Property 6: Entry Line Count Limit
// **Validates: Requirements 1.4, 3.7**
describe('Property 6: Entry Line Count Limit', () => {
  it('rejects submissions with more than 20 entries regardless of individual validity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 21, max: 30 }),
        (entryCount) => {
          // Generate valid entries — the rejection is based purely on count
          const parsedEntries: ParsedEntry[] = Array.from({ length: entryCount }, (_, idx) => ({
            day: VALID_DAYS[idx % 7],
            startTime: '10:00',
            title: `Stream ${idx + 1}`,
            lineNumber: idx + 1,
          }));

          const result = validateBulkEntries(parsedEntries);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThanOrEqual(1);
          expect(result.errors[0].message).toContain('20');
          expect(result.normalizedEntries).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects submissions with more than 20 entries even if entries are invalid', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 21, max: 30 }),
        (entryCount) => {
          // Generate invalid entries — still rejected on count alone
          const parsedEntries: ParsedEntry[] = Array.from({ length: entryCount }, (_, idx) => ({
            day: 'NotADay',
            startTime: 'invalid',
            title: '',
            lineNumber: idx + 1,
          }));

          const result = validateBulkEntries(parsedEntries);

          expect(result.valid).toBe(false);
          // The count limit error should be reported
          expect(result.errors.some((e) => e.message.includes('20'))).toBe(true);
          expect(result.normalizedEntries).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('accepts submissions with exactly 20 valid entries', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.constantFrom(...VALID_DAYS),
            validTimeArb,
            validTitleArb
          ),
          { minLength: 20, maxLength: 20 }
        ),
        (entries) => {
          const parsedEntries: ParsedEntry[] = entries.map(([day, time, title], idx) => ({
            day,
            startTime: time,
            title,
            lineNumber: idx + 1,
          }));

          const result = validateBulkEntries(parsedEntries);

          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
          expect(result.normalizedEntries).toHaveLength(20);
        }
      ),
      { numRuns: 100 }
    );
  });
});
