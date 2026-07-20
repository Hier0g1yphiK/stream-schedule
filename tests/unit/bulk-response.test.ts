import { describe, it, expect } from 'vitest';
import {
  formatBulkConfirmation,
  formatBulkErrors,
  formatNoEntriesError,
  formatLimitExceededError,
} from '../../src/utils/bulk-response';
import { DayOfWeek, ScheduleEntry } from '../../src/types';
import { LineParseResult } from '../../src/utils/bulk-parser';
import { BulkValidationError } from '../../src/utils/bulk-validator';

function makeEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    id: 1,
    guildId: 'guild-1',
    userId: 'user-1',
    username: 'testuser',
    day: DayOfWeek.Monday,
    startTime: '09:00',
    title: 'Stream',
    weekId: '2024-W03',
    ...overrides,
  };
}

describe('formatBulkConfirmation', () => {
  it('formats a single entry correctly', () => {
    const entries = [makeEntry()];
    const result = formatBulkConfirmation(entries, '2024-W03');

    expect(result).toContain('✅ **1 entries added to your schedule (Week 2024-W03)**');
    expect(result).toContain('• **Monday** 09:00 — Stream');
  });

  it('orders entries by day (Mon→Sun) then by time', () => {
    const entries = [
      makeEntry({ day: DayOfWeek.Wednesday, startTime: '14:00', title: 'Afternoon' }),
      makeEntry({ day: DayOfWeek.Monday, startTime: '10:00', title: 'Morning' }),
      makeEntry({ day: DayOfWeek.Monday, startTime: '08:00', title: 'Early' }),
      makeEntry({ day: DayOfWeek.Sunday, startTime: '20:00', title: 'Evening' }),
    ];
    const result = formatBulkConfirmation(entries, '2024-W03');

    const lines = result.split('\n').filter((l) => l.startsWith('•'));
    expect(lines[0]).toContain('Monday');
    expect(lines[0]).toContain('08:00');
    expect(lines[1]).toContain('Monday');
    expect(lines[1]).toContain('10:00');
    expect(lines[2]).toContain('Wednesday');
    expect(lines[2]).toContain('14:00');
    expect(lines[3]).toContain('Sunday');
    expect(lines[3]).toContain('20:00');
  });

  it('truncates when message exceeds 2000 characters', () => {
    // Create entries with long titles to exceed the limit
    const longTitle = 'A'.repeat(80);
    const entries = Array.from({ length: 20 }, (_, i) =>
      makeEntry({
        id: i + 1,
        day: DayOfWeek.Monday,
        startTime: `${String(i).padStart(2, '0')}:00`,
        title: `${longTitle} ${i}`,
      })
    );
    const result = formatBulkConfirmation(entries, '2024-W03');

    expect(result.length).toBeLessThanOrEqual(2000);
    expect(result).toContain('…and');
    expect(result).toContain('more entries');
  });

  it('does not truncate when message is within limit', () => {
    const entries = [
      makeEntry({ day: DayOfWeek.Monday, startTime: '09:00', title: 'Short' }),
      makeEntry({ day: DayOfWeek.Tuesday, startTime: '10:00', title: 'Also short' }),
    ];
    const result = formatBulkConfirmation(entries, '2024-W03');

    expect(result).not.toContain('…and');
    expect(result.length).toBeLessThanOrEqual(2000);
  });
});

describe('formatBulkErrors', () => {
  it('formats parse errors with entry number prefix', () => {
    const parseErrors: (LineParseResult & { ok: false })[] = [
      { ok: false, lineNumber: 2, raw: 'Monday', error: 'Entry 2: Expected at least 3 tokens (Day HH:MM Title), got 1' },
    ];
    const result = formatBulkErrors(parseErrors, []);

    expect(result).toContain('❌ **Schedule errors:**');
    expect(result).toContain('Entry 2:');
  });

  it('formats validation errors with entry number prefix', () => {
    const validationErrors: BulkValidationError[] = [
      { lineNumber: 3, field: 'day', message: 'Invalid day: Funday' },
      { lineNumber: 5, field: 'time', message: 'Invalid time format: 25:00' },
    ];
    const result = formatBulkErrors([], validationErrors);

    expect(result).toContain('Entry 3: Invalid day: Funday');
    expect(result).toContain('Entry 5: Invalid time format: 25:00');
  });

  it('combines and sorts parse and validation errors by entry number', () => {
    const parseErrors: (LineParseResult & { ok: false })[] = [
      { ok: false, lineNumber: 5, raw: 'bad', error: 'Too few tokens' },
    ];
    const validationErrors: BulkValidationError[] = [
      { lineNumber: 2, field: 'day', message: 'Invalid day' },
    ];
    const result = formatBulkErrors(parseErrors, validationErrors);
    const lines = result.split('\n').filter((l) => l.startsWith('Entry'));

    expect(lines[0]).toContain('Entry 2:');
    expect(lines[1]).toContain('Entry 5:');
  });

  it('truncates when error message exceeds 2000 characters', () => {
    const validationErrors: BulkValidationError[] = Array.from({ length: 50 }, (_, i) => ({
      lineNumber: i + 1,
      field: 'title' as const,
      message: 'Title exceeds maximum length of 100 characters. ' + 'X'.repeat(50),
    }));
    const result = formatBulkErrors([], validationErrors);

    expect(result.length).toBeLessThanOrEqual(2000);
    expect(result).toContain('…and');
    expect(result).toContain('more errors');
  });
});

describe('formatNoEntriesError', () => {
  it('returns the expected no-entries error message', () => {
    const result = formatNoEntriesError();
    expect(result).toBe(
      '❌ No entries provided. Please include at least one entry in the format: `Day HH:MM Title`'
    );
  });
});

describe('formatLimitExceededError', () => {
  it('returns a message with current count, attempted, and max', () => {
    const result = formatLimitExceededError(15, 8, 20);
    expect(result).toBe(
      '❌ You have 15 entries this week. Adding 8 new entries would exceed the limit of 20.'
    );
  });

  it('works with zero existing entries', () => {
    const result = formatLimitExceededError(0, 25, 20);
    expect(result).toBe(
      '❌ You have 0 entries this week. Adding 25 new entries would exceed the limit of 20.'
    );
  });
});
