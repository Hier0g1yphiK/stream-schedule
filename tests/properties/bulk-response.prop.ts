import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatBulkConfirmation, formatBulkErrors } from '../../src/utils/bulk-response';
import { ScheduleEntry, DayOfWeek } from '../../src/types';
import { BulkValidationError } from '../../src/utils/bulk-validator';
import { LineParseResult } from '../../src/utils/bulk-parser';

// Feature: bulk-schedule-command, Property 8: Confirmation Message Formatting
// **Validates: Requirements 6.1, 6.2**

const ALL_DAYS: DayOfWeek[] = [
  DayOfWeek.Monday,
  DayOfWeek.Tuesday,
  DayOfWeek.Wednesday,
  DayOfWeek.Thursday,
  DayOfWeek.Friday,
  DayOfWeek.Saturday,
  DayOfWeek.Sunday,
];

const DAY_ORDER: Record<DayOfWeek, number> = {
  [DayOfWeek.Monday]: 0,
  [DayOfWeek.Tuesday]: 1,
  [DayOfWeek.Wednesday]: 2,
  [DayOfWeek.Thursday]: 3,
  [DayOfWeek.Friday]: 4,
  [DayOfWeek.Saturday]: 5,
  [DayOfWeek.Sunday]: 6,
};

/**
 * Arbitrary that produces a valid HH:MM time string.
 */
const validTimeArb = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

/**
 * Arbitrary that produces a valid title (1-50 chars, no newlines).
 */
const validTitleArb = fc
  .stringOf(fc.char().filter((c) => c !== '\n' && c !== '\r'), { minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary that produces a valid weekId in YYYY-Www format.
 */
const weekIdArb = fc
  .tuple(fc.integer({ min: 2024, max: 2030 }), fc.integer({ min: 1, max: 52 }))
  .map(([y, w]) => `${y}-W${w.toString().padStart(2, '0')}`);

/**
 * Arbitrary that produces a valid ScheduleEntry.
 */
const scheduleEntryArb = fc
  .tuple(
    fc.integer({ min: 1, max: 1000 }),
    fc.constantFrom(...ALL_DAYS),
    validTimeArb,
    validTitleArb
  )
  .map(([id, day, startTime, title]): ScheduleEntry => ({
    id,
    guildId: 'guild-1',
    userId: 'user-1',
    username: 'testuser',
    day,
    startTime,
    title,
    weekId: '2024-W10',
  }));

describe('Property 8: Confirmation Message Formatting', () => {
  it('confirmation message contains entry count, week ID, and entries ordered by day then time', () => {
    fc.assert(
      fc.property(
        fc.array(scheduleEntryArb, { minLength: 1, maxLength: 10 }),
        weekIdArb,
        (entries, weekId) => {
          // Assign the same weekId to all entries
          const entriesWithWeek = entries.map((e) => ({ ...e, weekId }));
          const message = formatBulkConfirmation(entriesWithWeek, weekId);

          // Must contain the entry count
          expect(message).toContain(`${entries.length} entries`);

          // Must contain the week ID
          expect(message).toContain(weekId);

          // Extract the entry lines (lines starting with "•")
          const lines = message.split('\n').filter((line) => line.startsWith('•'));
          expect(lines.length).toBeGreaterThanOrEqual(1);

          // Verify ordering: extract day and timestamp from each line
          // Format is: • **Day** <t:UNIX:t> — Title
          const entryData = lines.map((line) => {
            const match = line.match(/^• \*\*(\w+)\*\* <t:(\d+):t> — (.+)$/);
            expect(match).not.toBeNull();
            return {
              day: match![1] as DayOfWeek,
              unix: parseInt(match![2], 10),
            };
          });

          // Verify ordering: day order first, then ascending unix timestamp within same day
          for (let i = 1; i < entryData.length; i++) {
            const prev = entryData[i - 1];
            const curr = entryData[i];
            const dayDiff = DAY_ORDER[prev.day] - DAY_ORDER[curr.day];
            if (dayDiff < 0) {
              // Previous day is earlier - correct order
              continue;
            } else if (dayDiff === 0) {
              // Same day - unix timestamp must be ascending
              expect(prev.unix <= curr.unix).toBe(true);
            } else {
              // Previous day is later - incorrect order
              expect(dayDiff).toBeLessThanOrEqual(0);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each entry appears on its own line in the confirmation message', () => {
    fc.assert(
      fc.property(
        fc.array(scheduleEntryArb, { minLength: 1, maxLength: 5 }),
        weekIdArb,
        (entries, weekId) => {
          const entriesWithWeek = entries.map((e) => ({ ...e, weekId }));
          const message = formatBulkConfirmation(entriesWithWeek, weekId);

          // If message is not truncated, all entries should appear
          if (!message.includes('…and')) {
            const bulletLines = message.split('\n').filter((line) => line.startsWith('•'));
            expect(bulletLines.length).toBe(entries.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: bulk-schedule-command, Property 9: Message Truncation
// **Validates: Requirements 6.3**

/**
 * Arbitrary that produces a ScheduleEntry with a long title to trigger truncation.
 */
const longTitleEntryArb = fc
  .tuple(
    fc.integer({ min: 1, max: 1000 }),
    fc.constantFrom(...ALL_DAYS),
    validTimeArb,
    fc.stringOf(fc.char().filter((c) => c !== '\n' && c !== '\r'), { minLength: 50, maxLength: 100 }).filter((s) => s.trim().length > 0)
  )
  .map(([id, day, startTime, title]): ScheduleEntry => ({
    id,
    guildId: 'guild-1',
    userId: 'user-1',
    username: 'testuser',
    day,
    startTime,
    title,
    weekId: '2024-W10',
  }));

describe('Property 9: Message Truncation', () => {
  it('formatted confirmation message never exceeds 2000 characters', () => {
    fc.assert(
      fc.property(
        fc.array(longTitleEntryArb, { minLength: 1, maxLength: 20 }),
        weekIdArb,
        (entries, weekId) => {
          const entriesWithWeek = entries.map((e) => ({ ...e, weekId }));
          const message = formatBulkConfirmation(entriesWithWeek, weekId);
          expect(message.length).toBeLessThanOrEqual(2000);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('when truncation occurs, message ends with indicator showing how many entries are not shown', () => {
    fc.assert(
      fc.property(
        fc.array(longTitleEntryArb, { minLength: 15, maxLength: 20 }),
        weekIdArb,
        (entries, weekId) => {
          const entriesWithWeek = entries.map((e) => ({ ...e, weekId }));
          const message = formatBulkConfirmation(entriesWithWeek, weekId);

          // If truncation occurred
          if (message.includes('…and')) {
            // Must match the pattern "…and N more entries"
            const truncationMatch = message.match(/…and (\d+) more entries$/);
            expect(truncationMatch).not.toBeNull();

            // The number should be positive
            const notShown = parseInt(truncationMatch![1], 10);
            expect(notShown).toBeGreaterThan(0);

            // Total entries = shown bullet lines + not shown
            const bulletLines = message.split('\n').filter((line) => line.startsWith('•'));
            expect(bulletLines.length + notShown).toBe(entries.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: bulk-schedule-command, Property 10: Error Message Line Numbering
// **Validates: Requirements 6.4**

/**
 * Arbitrary that produces a parse error with a specific line number.
 */
const parseErrorArb = fc
  .tuple(
    fc.integer({ min: 1, max: 100 }),
    fc.stringOf(fc.char().filter((c) => c !== '\n' && c !== '\r'), { minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0)
  )
  .map(([lineNumber, raw]): LineParseResult & { ok: false } => ({
    ok: false,
    lineNumber,
    raw,
    error: `Expected at least 3 tokens, got 1`,
  }));

/**
 * Arbitrary that produces a validation error with a specific line number.
 */
const validationErrorArb = fc
  .tuple(
    fc.integer({ min: 1, max: 100 }),
    fc.constantFrom('day', 'time', 'title') as fc.Arbitrary<'day' | 'time' | 'title'>,
    fc.stringOf(fc.char().filter((c) => c !== '\n' && c !== '\r'), { minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)
  )
  .map(([lineNumber, field, msg]): BulkValidationError => ({
    lineNumber,
    field,
    message: msg,
  }));

describe('Property 10: Error Message Entry Numbering', () => {
  it('each error line is prefixed with "Entry N:" where N matches the error lineNumber', () => {
    fc.assert(
      fc.property(
        fc.array(parseErrorArb, { minLength: 0, maxLength: 5 }),
        fc.array(validationErrorArb, { minLength: 0, maxLength: 5 }),
        (parseErrors, validationErrors) => {
          // Ensure at least one error exists
          if (parseErrors.length === 0 && validationErrors.length === 0) return;

          const message = formatBulkErrors(parseErrors, validationErrors);

          // Collect all expected line numbers
          const allExpectedLineNumbers = [
            ...parseErrors.map((e) => e.lineNumber),
            ...validationErrors.map((e) => e.lineNumber),
          ].sort((a, b) => a - b);

          // Extract lines that start with "Entry N:"
          const errorLines = message.split('\n').filter((line) => /^Entry \d+:/.test(line));

          // If not truncated, there should be one line per error
          if (!message.includes('…and')) {
            expect(errorLines.length).toBe(allExpectedLineNumbers.length);
          }

          // Each error line should be prefixed with "Entry N:" matching a lineNumber
          for (const line of errorLines) {
            const match = line.match(/^Entry (\d+):/);
            expect(match).not.toBeNull();
            const lineNum = parseInt(match![1], 10);
            expect(allExpectedLineNumbers).toContain(lineNum);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('error message contains one line per error sorted by entry number', () => {
    fc.assert(
      fc.property(
        fc.array(parseErrorArb, { minLength: 1, maxLength: 5 }),
        fc.array(validationErrorArb, { minLength: 0, maxLength: 5 }),
        (parseErrors, validationErrors) => {
          const message = formatBulkErrors(parseErrors, validationErrors);

          // Extract "Entry N:" prefixed lines
          const errorLines = message.split('\n').filter((line) => /^Entry \d+:/.test(line));

          // Verify ordering by entry number (ascending)
          const lineNumbers = errorLines.map((line) => {
            const match = line.match(/^Entry (\d+):/);
            return parseInt(match![1], 10);
          });

          for (let i = 1; i < lineNumbers.length; i++) {
            expect(lineNumbers[i]).toBeGreaterThanOrEqual(lineNumbers[i - 1]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
