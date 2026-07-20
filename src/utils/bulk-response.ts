/**
 * Response formatter for the /schedule bulk command.
 * Formats confirmation messages, error messages, and handles Discord's 2000-char limit.
 */

import { ScheduleEntry, DayOfWeek } from '../types';
import { BulkValidationError } from './bulk-validator';
import { LineParseResult } from './bulk-parser';

/** Discord message character limit. */
const DISCORD_MAX_LENGTH = 2000;

/** Day ordering: Monday=0 through Sunday=6. */
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
 * Formats a success confirmation message.
 * Lists entries ordered by day (Mon→Sun) then time.
 * Truncates if message would exceed 2000 characters.
 */
export function formatBulkConfirmation(
  entries: ScheduleEntry[],
  weekId: string
): string {
  const sorted = [...entries].sort((a, b) => {
    const dayDiff = DAY_ORDER[a.day] - DAY_ORDER[b.day];
    if (dayDiff !== 0) return dayDiff;
    return a.startTime.localeCompare(b.startTime);
  });

  const header = `✅ **${sorted.length} entries added to your schedule (Week ${weekId})**\n\n`;
  const entryLines = sorted.map(
    (entry) => `• **${entry.day}** ${entry.startTime} — ${entry.title}`
  );

  // Check if full message fits within Discord limit
  const fullMessage = header + entryLines.join('\n');
  if (fullMessage.length <= DISCORD_MAX_LENGTH) {
    return fullMessage;
  }

  // Truncate: include as many entries as fit, then append overflow indicator
  let result = header;
  let includedCount = 0;

  for (let i = 0; i < entryLines.length; i++) {
    const remaining = entryLines.length - i;
    const overflowSuffix = `\n\n…and ${remaining} more entries`;
    const lineToAdd = (includedCount === 0 ? '' : '\n') + entryLines[i];

    // Check if adding this line plus a potential overflow suffix would exceed limit
    if (result.length + lineToAdd.length + overflowSuffix.length > DISCORD_MAX_LENGTH) {
      const notShown = entryLines.length - includedCount;
      result += `\n\n…and ${notShown} more entries`;
      return result;
    }

    result += lineToAdd;
    includedCount++;
  }

  return result;
}

/**
 * Formats validation errors into an ephemeral error message.
 * Each error on its own line prefixed with "Entry N: ...".
 */
export function formatBulkErrors(
  parseErrors: (LineParseResult & { ok: false })[],
  validationErrors: BulkValidationError[]
): string {
  const header = '❌ **Schedule errors:**\n\n';

  const allErrors: { lineNumber: number; message: string }[] = [];

  for (const err of parseErrors) {
    allErrors.push({ lineNumber: err.lineNumber, message: err.error });
  }

  for (const err of validationErrors) {
    allErrors.push({ lineNumber: err.lineNumber, message: err.message });
  }

  // Sort by line number for consistent ordering
  allErrors.sort((a, b) => a.lineNumber - b.lineNumber);

  const errorLines = allErrors.map(
    (err) => `Entry ${err.lineNumber}: ${err.message}`
  );

  const fullMessage = header + errorLines.join('\n');
  if (fullMessage.length <= DISCORD_MAX_LENGTH) {
    return fullMessage;
  }

  // Truncate errors if message is too long
  let result = header;
  let includedCount = 0;

  for (let i = 0; i < errorLines.length; i++) {
    const remaining = errorLines.length - i;
    const overflowSuffix = `\n\n…and ${remaining} more errors`;
    const lineToAdd = (includedCount === 0 ? '' : '\n') + errorLines[i];

    if (result.length + lineToAdd.length + overflowSuffix.length > DISCORD_MAX_LENGTH) {
      const notShown = errorLines.length - includedCount;
      result += `\n\n…and ${notShown} more errors`;
      return result;
    }

    result += lineToAdd;
    includedCount++;
  }

  return result;
}

/**
 * Formats a "no entries provided" error.
 */
export function formatNoEntriesError(): string {
  return '❌ No entries provided. Please include at least one entry in the format: `Day HH:MM Title`';
}

/**
 * Formats the limit-exceeded error showing current count and max.
 */
export function formatLimitExceededError(
  currentCount: number,
  attemptedNew: number,
  max: number
): string {
  return `❌ You have ${currentCount} entries this week. Adding ${attemptedNew} new entries would exceed the limit of ${max}.`;
}
