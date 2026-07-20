# Implementation Plan: Bulk Schedule Command

## Overview

Implement the `/schedule bulk` subcommand that allows streamers to submit multiple schedule entries in a single interaction. The implementation adds a parser, validator, pretty-printer, response formatter, bulk storage method, and command handler — all wired into the existing Discord bot architecture.

## Tasks

- [x] 1. Create parser and pretty-printer modules
  - [x] 1.1 Implement the bulk parser module (`src/utils/bulk-parser.ts`)
    - Create `ParsedEntry`, `LineParseResult`, and `BulkParseResult` interfaces
    - Implement `parseBulkInput` function that splits on newlines, skips blank lines, extracts day/time/title tokens, and reports errors for lines with fewer than 3 tokens
    - Include 1-based line numbering that accounts for skipped blank lines
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 1.2 Implement the pretty-printer module (`src/utils/bulk-printer.ts`)
    - Implement `formatBulkEntries` function that formats a list of `ParsedEntry` objects back into `Day HH:MM Title` lines joined by newlines
    - Return empty string for an empty list
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 1.3 Write property tests for parser round-trip (`tests/properties/bulk-parser.prop.ts`)
    - **Property 1: Parse/Format Round-Trip**
    - **Validates: Requirements 2.1, 2.2, 2.5, 5.1, 5.2, 5.3**

  - [x] 1.4 Write property test for blank line filtering (`tests/properties/bulk-parser.prop.ts`)
    - **Property 2: Blank Line Filtering**
    - **Validates: Requirements 2.4**

  - [x] 1.5 Write property test for incomplete line parse errors (`tests/properties/bulk-parser.prop.ts`)
    - **Property 3: Incomplete Line Parse Error**
    - **Validates: Requirements 2.3**

  - [x] 1.6 Write property test for all-whitespace input rejection (`tests/properties/bulk-parser.prop.ts`)
    - **Property 11: All-Whitespace Input Rejection**
    - **Validates: Requirements 6.6**

  - [x] 1.7 Write unit tests for parser edge cases (`tests/unit/bulk-parser.test.ts`)
    - Test CRLF line ending handling
    - Test Unicode characters in titles
    - Test titles at max 100-character boundary
    - Test input with mixed blank and valid lines
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2. Implement bulk validator
  - [x] 2.1 Create the bulk validator module (`src/utils/bulk-validator.ts`)
    - Define `BulkValidationError`, `BulkValidationResult`, and `NormalizedEntry` interfaces
    - Implement `validateBulkEntries` that validates each parsed entry using existing `validateDay`, `validateTime`, `validateTitle` functions
    - Accumulate all errors across all entries (no short-circuit)
    - Enforce the max 20 entry lines per submission limit
    - Normalize valid day values to `DayOfWeek` enum casing
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_

  - [x] 2.2 Write property test for validation error accumulation (`tests/properties/bulk-validator.prop.ts`)
    - **Property 4: Validation Error Accumulation**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [x] 2.3 Write property test for case-insensitive day normalization (`tests/properties/bulk-validator.prop.ts`)
    - **Property 5: Case-Insensitive Day Normalization**
    - **Validates: Requirements 3.5**

  - [x] 2.4 Write property test for entry line count limit (`tests/properties/bulk-validator.prop.ts`)
    - **Property 6: Entry Line Count Limit**
    - **Validates: Requirements 1.4, 3.7**

  - [x] 2.5 Write unit tests for validator edge cases (`tests/unit/bulk-validator.test.ts`)
    - Test boundary times (00:00, 23:59)
    - Test exactly 20 entries (accepted) vs 21 entries (rejected)
    - Test title with exactly 100 characters (valid) and 101 characters (invalid)
    - _Requirements: 3.1, 3.2, 3.3, 3.7_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement response formatter and bulk storage
  - [x] 4.1 Create the response formatter module (`src/utils/bulk-response.ts`)
    - Implement `formatBulkConfirmation` that lists entries ordered by day (Mon→Sun) then time, with entry count and week ID
    - Implement `formatBulkErrors` that formats parse and validation errors with `Line N:` prefix
    - Implement `formatNoEntriesError` and `formatLimitExceededError`
    - Truncate messages exceeding 2000 characters with "…and N more entries" indicator
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 4.2 Write property test for confirmation message formatting (`tests/properties/bulk-response.prop.ts`)
    - **Property 8: Confirmation Message Formatting**
    - **Validates: Requirements 6.1, 6.2**

  - [x] 4.3 Write property test for message truncation (`tests/properties/bulk-response.prop.ts`)
    - **Property 9: Message Truncation**
    - **Validates: Requirements 6.3**

  - [x] 4.4 Write property test for error message line numbering (`tests/properties/bulk-response.prop.ts`)
    - **Property 10: Error Message Line Numbering**
    - **Validates: Requirements 6.4**

  - [x] 4.5 Extend `ScheduleService` with `bulkAddEntries` method (`src/services/schedule-service.ts`)
    - Add `BulkAddResult` interface
    - Implement `bulkAddEntries` that wraps all `addEntry` calls in a single `db.transaction()`
    - Pre-check net new count: calculate replacements, verify existing + net new ≤ 20
    - Throw on limit exceeded (no partial writes)
    - Roll back on any storage failure
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

  - [x] 4.6 Write property test for net new count enforcement (`tests/properties/bulk-storage.prop.ts`)
    - **Property 7: Net New Count Enforcement**
    - **Validates: Requirements 3.6, 4.2, 4.3**

  - [x] 4.7 Write unit tests for response formatter (`tests/unit/bulk-response.test.ts`)
    - Test specific confirmation message examples
    - Test error message formatting with multiple errors
    - Test truncation at the 2000-character boundary
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Wire up command handler and registration
  - [x] 6.1 Register the `bulk` subcommand in command definitions (`src/commands/index.ts`)
    - Add `bulk` subcommand to the `/schedule` command group with a required `entries` string option (max 6000 chars)
    - _Requirements: 1.1, 1.2_

  - [x] 6.2 Implement `handleBulk` in the schedule command handler (`src/commands/schedule.ts`)
    - Add the `handleBulk` function following the pipeline: parse → validate → pre-check → store → respond
    - Handle all error cases in precedence order: no entries → parse errors → count > 20 → validation errors → net new limit → storage failure
    - Resolve the current `weekId` using guild config (default Monday 09:00 UTC if not configured)
    - Route the `bulk` subcommand in the main `handleScheduleCommand` switch
    - _Requirements: 1.1, 1.3, 3.4, 3.6, 4.1, 4.4, 4.6, 6.1, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3_

  - [x] 6.3 Write unit tests for bulk command registration (`tests/unit/bulk-command.test.ts`)
    - Verify the `bulk` subcommand exists with correct options
    - _Requirements: 1.1, 1.2_

  - [x] 6.4 Write integration tests for the full bulk flow (`tests/integration/bulk-flow.test.ts`)
    - Test parse → validate → store → confirm end-to-end
    - Test transaction rollback on simulated failure
    - Test UPSERT behavior with overlapping entries
    - Test limit enforcement with existing entries + bulk submission
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses `vitest` for testing and `fast-check` for property-based tests (both already configured)
- All new modules are pure functions (no I/O) except `bulkAddEntries`, enabling straightforward testing

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4", "1.5", "1.6", "1.7", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.7"] },
    { "id": 4, "tasks": ["4.6", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3"] },
    { "id": 6, "tasks": ["6.4"] }
  ]
}
```
