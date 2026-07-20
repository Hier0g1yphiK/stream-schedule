import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseBulkInput, ParsedEntry } from '../../src/utils/bulk-parser';
import { formatBulkEntries } from '../../src/utils/bulk-printer';

const VALID_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/**
 * Arbitrary that produces a valid day name.
 */
const validDayArb = fc.constantFrom(...VALID_DAYS);

/**
 * Arbitrary that produces a valid HH:MM time string (00:00 through 23:59).
 */
const validTimeArb = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

/**
 * Arbitrary that produces a valid title: 1-100 characters, no newline characters,
 * no pipe characters, no leading/trailing whitespace.
 */
const validTitleArb = fc
  .stringOf(
    fc.char().filter((c) => c !== '\n' && c !== '\r' && c !== '|'),
    { minLength: 1, maxLength: 100 }
  )
  .map((s) => s.trim())
  .filter((s) => s.length >= 1 && s.length <= 100);

/**
 * Arbitrary that produces a valid parsed entry (day, time, title).
 */
const validEntryArb = fc.tuple(validDayArb, validTimeArb, validTitleArb).map(
  ([day, startTime, title]) => ({ day, startTime, title })
);

// Feature: bulk-schedule-command, Property 1: Parse/Format Round-Trip
// **Validates: Requirements 2.1, 2.2, 2.5, 5.1, 5.2, 5.3**

describe('Property 1: Parse/Format Round-Trip', () => {
  it('formatting then parsing produces equivalent entries in the same order', () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 0, maxLength: 20 }),
        (entries) => {
          // Build ParsedEntry[] with lineNumbers for the printer
          const parsedEntries: ParsedEntry[] = entries.map((e, i) => ({
            day: e.day,
            startTime: e.startTime,
            title: e.title,
            lineNumber: i + 1,
          }));

          // Format → parse round-trip
          const formatted = formatBulkEntries(parsedEntries);
          const result = parseBulkInput(formatted);

          // No errors should occur
          expect(result.errors).toHaveLength(0);

          // Same number of entries
          expect(result.entries).toHaveLength(entries.length);

          // Each entry should have identical day, startTime, and title in the same order
          for (let i = 0; i < entries.length; i++) {
            expect(result.entries[i].day).toBe(entries[i].day);
            expect(result.entries[i].startTime).toBe(entries[i].startTime);
            expect(result.entries[i].title).toBe(entries[i].title);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: bulk-schedule-command, Property 2: Blank Line Filtering
// **Validates: Requirements 2.4**

describe('Property 2: Blank Segment Filtering', () => {
  it('blank or whitespace-only segments do not produce entries or errors', () => {
    /**
     * Arbitrary that produces a segment that is either empty or whitespace-only.
     */
    const blankSegmentArb = fc.stringOf(
      fc.constantFrom(' ', '\t', ' ', '\t'),
      { minLength: 0, maxLength: 20 }
    );

    /**
     * Arbitrary that produces a valid entry segment string (no pipes or newlines).
     */
    const validSegmentArb = fc
      .tuple(validDayArb, validTimeArb, validTitleArb)
      .map(([day, time, title]) => `${day} ${time} ${title}`);

    fc.assert(
      fc.property(
        fc.array(fc.oneof(blankSegmentArb, validSegmentArb), { minLength: 1, maxLength: 30 }),
        (segments) => {
          const input = segments.join(' | ');
          const result = parseBulkInput(input);

          // Count how many segments are non-blank and have at least 3 tokens
          const nonBlankSegments = segments.filter((seg) => seg.trim().length > 0);
          const segmentsWithThreeTokens = nonBlankSegments.filter(
            (seg) => seg.trim().split(/\s+/).length >= 3
          );
          const segmentsWithFewerTokens = nonBlankSegments.filter(
            (seg) => seg.trim().split(/\s+/).length < 3
          );

          // Entries count equals segments with 3+ tokens
          expect(result.entries).toHaveLength(segmentsWithThreeTokens.length);

          // Errors count equals non-blank segments with fewer than 3 tokens
          expect(result.errors).toHaveLength(segmentsWithFewerTokens.length);

          // Total parsed items (entries + errors) equals the number of non-blank segments
          expect(result.entries.length + result.errors.length).toBe(nonBlankSegments.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: bulk-schedule-command, Property 3: Incomplete Line Parse Error
// **Validates: Requirements 2.3**

describe('Property 3: Incomplete Segment Parse Error', () => {
  it('segments with fewer than 3 tokens produce errors with correct entry number and raw content', () => {
    /**
     * Arbitrary that produces a segment with 1 or 2 tokens (non-empty, no pipe/newline).
     */
    const incompleteSegmentArb = fc.oneof(
      // Single token: a non-whitespace word (no pipe)
      fc.stringOf(fc.char().filter((c) => !/[\s|]/.test(c)), { minLength: 1, maxLength: 20 }),
      // Two tokens: two non-whitespace words separated by space (no pipe)
      fc
        .tuple(
          fc.stringOf(fc.char().filter((c) => !/[\s|]/.test(c)), { minLength: 1, maxLength: 15 }),
          fc.stringOf(fc.char().filter((c) => !/[\s|]/.test(c)), { minLength: 1, maxLength: 15 })
        )
        .map(([a, b]) => `${a} ${b}`)
    );

    fc.assert(
      fc.property(
        incompleteSegmentArb,
        (incompleteSegment) => {
          const input = incompleteSegment;
          const result = parseBulkInput(input);

          // The incomplete segment should produce exactly one error
          expect(result.errors).toHaveLength(1);

          // Entry number should be 1
          expect(result.errors[0].lineNumber).toBe(1);

          // Raw content should match the trimmed incomplete segment
          expect(result.errors[0].raw).toBe(incompleteSegment.trim());
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: bulk-schedule-command, Property 11: All-Whitespace Input Rejection
// **Validates: Requirements 6.6**

describe('Property 11: All-Whitespace Input Rejection', () => {
  it('input composed entirely of whitespace, pipes, and newlines produces zero entries', () => {
    /**
     * Arbitrary that produces a string made entirely of whitespace characters, pipes, and newlines.
     */
    const whitespaceOnlyArb = fc.stringOf(
      fc.constantFrom(' ', '\t', '\n', '\r\n', '\r', '|', '  ', '\t\t'),
      { minLength: 0, maxLength: 50 }
    );

    fc.assert(
      fc.property(whitespaceOnlyArb, (input) => {
        const result = parseBulkInput(input);

        // Zero entries produced
        expect(result.entries).toHaveLength(0);

        // Zero errors produced (blank segments don't produce errors)
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });
});
