import { ParsedEntry } from './bulk-parser';

/**
 * Formats structured entries back into bulk input text.
 * Inverse of parseBulkInput for round-trip verification.
 * Uses pipe separator for Discord-friendly single-line input.
 */
export function formatBulkEntries(entries: ParsedEntry[]): string {
  if (entries.length === 0) {
    return '';
  }

  return entries
    .map((entry) => `${entry.day} ${entry.startTime} ${entry.title}`)
    .join(' | ');
}
