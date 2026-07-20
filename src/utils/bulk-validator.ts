/**
 * Bulk validator for the /schedule bulk command.
 * Validates parsed entries against day/time/title rules and enforces entry count limits.
 */

import { ParsedEntry } from './bulk-parser';
import { DayOfWeek } from '../types';
import { validateDay, validateTime, validateTitle } from './validators';

/** Maximum number of entry lines allowed per bulk submission. */
const MAX_ENTRIES_PER_SUBMISSION = 20;

/** Case-insensitive lookup map for normalizing day names to DayOfWeek enum values. */
const VALID_DAYS_LOWER: Map<string, DayOfWeek> = new Map(
  Object.values(DayOfWeek).map((day) => [day.toLowerCase(), day])
);

export interface BulkValidationError {
  lineNumber: number;
  field: 'day' | 'time' | 'title';
  message: string;
}

export interface BulkValidationResult {
  valid: boolean;
  errors: BulkValidationError[];
  /** Entries with day normalized to proper case (e.g., "monday" → "Monday") */
  normalizedEntries: NormalizedEntry[];
}

export interface NormalizedEntry {
  day: DayOfWeek;
  startTime: string;
  title: string;
  lineNumber: number;
}

/**
 * Validates all parsed entries against day/time/title rules.
 * Accumulates all errors (does not short-circuit).
 * Also enforces the max 20 entry lines per submission limit.
 */
export function validateBulkEntries(entries: ParsedEntry[]): BulkValidationResult {
  // Check entry count first — reject immediately if over the limit
  if (entries.length > MAX_ENTRIES_PER_SUBMISSION) {
    return {
      valid: false,
      errors: [
        {
          lineNumber: 0,
          field: 'day',
          message: `Maximum of ${MAX_ENTRIES_PER_SUBMISSION} entries per submission exceeded (got ${entries.length}).`,
        },
      ],
      normalizedEntries: [],
    };
  }

  const errors: BulkValidationError[] = [];
  const normalizedEntries: NormalizedEntry[] = [];

  for (const entry of entries) {
    let entryValid = true;

    // Validate day
    const dayResult = validateDay(entry.day);
    if (!dayResult.valid) {
      errors.push({
        lineNumber: entry.lineNumber,
        field: 'day',
        message: dayResult.error!,
      });
      entryValid = false;
    }

    // Validate time
    const timeResult = validateTime(entry.startTime);
    if (!timeResult.valid) {
      errors.push({
        lineNumber: entry.lineNumber,
        field: 'time',
        message: timeResult.error!,
      });
      entryValid = false;
    }

    // Validate title
    const titleResult = validateTitle(entry.title);
    if (!titleResult.valid) {
      errors.push({
        lineNumber: entry.lineNumber,
        field: 'title',
        message: titleResult.error!,
      });
      entryValid = false;
    }

    // Only add to normalized entries if all fields are valid
    if (entryValid) {
      normalizedEntries.push({
        day: VALID_DAYS_LOWER.get(entry.day.toLowerCase())!,
        startTime: entry.startTime,
        title: entry.title,
        lineNumber: entry.lineNumber,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedEntries,
  };
}
