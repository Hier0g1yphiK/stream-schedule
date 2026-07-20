/**
 * Bulk input parser for the /schedule bulk command.
 * Splits multi-line text into structured schedule entry data.
 */

/** A single parsed entry line (unvalidated). */
export interface ParsedEntry {
  day: string;
  startTime: string;
  title: string;
  lineNumber: number; // 1-based
}

/** Result of parsing a single line. */
export type LineParseResult =
  | { ok: true; entry: ParsedEntry }
  | { ok: false; lineNumber: number; raw: string; error: string };

/** Result of parsing the full bulk input. */
export interface BulkParseResult {
  entries: ParsedEntry[];
  errors: (LineParseResult & { ok: false })[];
}

/**
 * Splits bulk input text into parsed entries.
 * Skips blank/whitespace-only segments.
 * Reports errors for segments with fewer than 3 tokens.
 *
 * Parsing rules:
 * - Split on pipe character `|` (also supports newlines as fallback)
 * - Trim each segment; skip segments that are empty or whitespace-only
 * - First whitespace-delimited token → day
 * - Second whitespace-delimited token → startTime
 * - Remainder of segment (trimmed) → title
 * - Segments with fewer than 3 tokens produce an error identifying entry number and raw content
 * - Entry numbering is 1-based and counts ALL non-empty segments
 */
export function parseBulkInput(input: string): BulkParseResult {
  // Split on pipe or newline — supports both delimiters
  const segments = input.split(/[|\n]/);
  const entries: ParsedEntry[] = [];
  const errors: (LineParseResult & { ok: false })[] = [];

  let entryNumber = 0;

  for (let i = 0; i < segments.length; i++) {
    const raw = segments[i].replace(/\r$/, ''); // handle \r\n
    const trimmed = raw.trim();

    // Skip blank/whitespace-only segments
    if (trimmed === '') {
      continue;
    }

    entryNumber++;

    // Split into tokens by whitespace
    const tokens = trimmed.split(/\s+/);

    if (tokens.length < 3) {
      errors.push({
        ok: false,
        lineNumber: entryNumber,
        raw: trimmed,
        error: `Entry ${entryNumber}: Expected at least 3 tokens (Day HH:MM Title), got ${tokens.length}`,
      });
      continue;
    }

    const day = tokens[0];
    const startTime = tokens[1];
    // Title is the remainder after day and time, preserving internal spaces
    const afterDay = trimmed.substring(day.length).trimStart();
    const title = afterDay.substring(startTime.length).trimStart();

    entries.push({ day, startTime, title, lineNumber: entryNumber });
  }

  return { entries, errors };
}
