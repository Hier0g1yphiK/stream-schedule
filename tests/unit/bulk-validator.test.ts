import { describe, it, expect } from 'vitest';
import { validateBulkEntries } from '../../src/utils/bulk-validator';
import { ParsedEntry } from '../../src/utils/bulk-parser';
import { DayOfWeek } from '../../src/types';

describe('validateBulkEntries', () => {
  it('returns valid result for valid entries', () => {
    const entries: ParsedEntry[] = [
      { day: 'Monday', startTime: '10:00', title: 'Morning Stream', lineNumber: 1 },
      { day: 'Wednesday', startTime: '14:30', title: 'Afternoon Stream', lineNumber: 2 },
    ];

    const result = validateBulkEntries(entries);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.normalizedEntries).toHaveLength(2);
    expect(result.normalizedEntries[0]).toEqual({
      day: DayOfWeek.Monday,
      startTime: '10:00',
      title: 'Morning Stream',
      lineNumber: 1,
    });
  });

  it('normalizes day names to proper DayOfWeek casing', () => {
    const entries: ParsedEntry[] = [
      { day: 'monday', startTime: '09:00', title: 'Stream', lineNumber: 1 },
      { day: 'TUESDAY', startTime: '10:00', title: 'Stream', lineNumber: 2 },
      { day: 'wEdNeSdAy', startTime: '11:00', title: 'Stream', lineNumber: 3 },
    ];

    const result = validateBulkEntries(entries);

    expect(result.valid).toBe(true);
    expect(result.normalizedEntries[0].day).toBe(DayOfWeek.Monday);
    expect(result.normalizedEntries[1].day).toBe(DayOfWeek.Tuesday);
    expect(result.normalizedEntries[2].day).toBe(DayOfWeek.Wednesday);
  });

  it('rejects entries exceeding 20 entry limit immediately', () => {
    const entries: ParsedEntry[] = Array.from({ length: 21 }, (_, i) => ({
      day: 'Monday',
      startTime: '10:00',
      title: 'Stream',
      lineNumber: i + 1,
    }));

    const result = validateBulkEntries(entries);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Maximum of 20');
    expect(result.errors[0].message).toContain('21');
    expect(result.normalizedEntries).toHaveLength(0);
  });

  it('accumulates all errors across all entries without short-circuiting', () => {
    const entries: ParsedEntry[] = [
      { day: 'InvalidDay', startTime: '25:00', title: '', lineNumber: 1 },
      { day: 'AlsoInvalid', startTime: 'bad', title: 'x'.repeat(101), lineNumber: 2 },
    ];

    const result = validateBulkEntries(entries);

    expect(result.valid).toBe(false);
    // Each entry has 3 invalid fields: 2 entries × 3 fields = 6 errors
    expect(result.errors).toHaveLength(6);
    expect(result.normalizedEntries).toHaveLength(0);
  });

  it('reports correct line numbers in errors', () => {
    const entries: ParsedEntry[] = [
      { day: 'Monday', startTime: '10:00', title: 'Valid', lineNumber: 1 },
      { day: 'badday', startTime: '10:00', title: 'Title', lineNumber: 3 },
      { day: 'Friday', startTime: '99:99', title: 'Title', lineNumber: 5 },
    ];

    const result = validateBulkEntries(entries);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].lineNumber).toBe(3);
    expect(result.errors[0].field).toBe('day');
    expect(result.errors[1].lineNumber).toBe(5);
    expect(result.errors[1].field).toBe('time');
  });

  it('only includes fully valid entries in normalizedEntries', () => {
    const entries: ParsedEntry[] = [
      { day: 'Monday', startTime: '10:00', title: 'Valid Stream', lineNumber: 1 },
      { day: 'badday', startTime: '10:00', title: 'Title', lineNumber: 2 },
      { day: 'Friday', startTime: '14:00', title: 'Another Valid', lineNumber: 3 },
    ];

    const result = validateBulkEntries(entries);

    expect(result.valid).toBe(false);
    expect(result.normalizedEntries).toHaveLength(2);
    expect(result.normalizedEntries[0].day).toBe(DayOfWeek.Monday);
    expect(result.normalizedEntries[1].day).toBe(DayOfWeek.Friday);
  });

  it('validates all three fields for each entry even if one fails', () => {
    const entries: ParsedEntry[] = [
      { day: 'InvalidDay', startTime: '10:00', title: 'Valid Title', lineNumber: 1 },
    ];

    const result = validateBulkEntries(entries);

    // Only the day is invalid; time and title are fine
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('day');
    expect(result.errors[0].lineNumber).toBe(1);
  });

  it('returns valid with empty entries array', () => {
    const result = validateBulkEntries([]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.normalizedEntries).toHaveLength(0);
  });

  it('accepts exactly 20 entries', () => {
    const entries: ParsedEntry[] = Array.from({ length: 20 }, (_, i) => ({
      day: 'Monday',
      startTime: '10:00',
      title: 'Stream',
      lineNumber: i + 1,
    }));

    const result = validateBulkEntries(entries);

    expect(result.valid).toBe(true);
    expect(result.normalizedEntries).toHaveLength(20);
  });

  it('validates time boundary values correctly', () => {
    const entries: ParsedEntry[] = [
      { day: 'Monday', startTime: '00:00', title: 'Midnight', lineNumber: 1 },
      { day: 'Tuesday', startTime: '23:59', title: 'Late Night', lineNumber: 2 },
    ];

    const result = validateBulkEntries(entries);

    expect(result.valid).toBe(true);
    expect(result.normalizedEntries).toHaveLength(2);
  });

  it('rejects title with exactly 101 characters', () => {
    const entries: ParsedEntry[] = [
      { day: 'Monday', startTime: '10:00', title: 'x'.repeat(101), lineNumber: 1 },
    ];

    const result = validateBulkEntries(entries);

    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('title');
  });

  it('accepts title with exactly 100 characters', () => {
    const entries: ParsedEntry[] = [
      { day: 'Monday', startTime: '10:00', title: 'x'.repeat(100), lineNumber: 1 },
    ];

    const result = validateBulkEntries(entries);

    expect(result.valid).toBe(true);
    expect(result.normalizedEntries).toHaveLength(1);
  });
});
