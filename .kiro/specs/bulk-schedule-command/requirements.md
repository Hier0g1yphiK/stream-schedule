# Requirements Document

## Introduction

This feature adds a `/schedule bulk` subcommand to the Discord Stream Schedule Bot. The bulk command allows users to submit an entire week's worth of stream entries in a single interaction, rather than invoking `/schedule add` repeatedly for each day and time. The command accepts a multi-line text input where each line represents one schedule entry in the format `Day HH:MM Title`. The bot parses, validates, and stores all entries atomically.

## Glossary

- **Bot**: The Discord Stream Schedule Bot application
- **Bulk_Input**: A multi-line text string where each line contains a day, start time, and stream title separated by spaces
- **Entry_Line**: A single line within the Bulk_Input following the format `Day HH:MM Title`
- **Parser**: The component responsible for converting raw Bulk_Input text into structured schedule entry data
- **Validator**: The component responsible for checking that parsed entry data meets format and business rules
- **Schedule_Service**: The existing service that persists schedule entries to the database
- **User**: A Discord guild member invoking the bulk schedule command
- **Week_Id**: The ISO week identifier (YYYY-Www) representing the current scheduling week

## Requirements

### Requirement 1: Bulk Command Registration

**User Story:** As a streamer, I want a `/schedule bulk` subcommand available in my server, so that I can submit my full weekly schedule in one interaction.

#### Acceptance Criteria

1. THE Bot SHALL register a `bulk` subcommand under the `/schedule` command group at the same level as the existing `add`, `remove`, and `mine` subcommands
2. THE Bot SHALL present the `bulk` subcommand with a required string option named `entries` with the description "Your schedule entries, one per line: Day HH:MM Title" and a maximum length of 6000 characters
3. THE Bot SHALL allow any guild member to invoke the `/schedule bulk` command without requiring administrator permissions
4. THE Bot SHALL accept a maximum of 20 entries per `/schedule bulk` invocation, where each entry is a single line within the `entries` string

### Requirement 2: Bulk Input Parsing

**User Story:** As a streamer, I want to type multiple schedule entries as lines of text, so that I can define my whole week at once.

#### Acceptance Criteria

1. WHEN a Bulk_Input is received, THE Parser SHALL split the input on newline characters to produce individual Entry_Lines
2. WHEN an Entry_Line is parsed, THE Parser SHALL extract the day as the first whitespace-delimited token, the time as the second whitespace-delimited token, and the title as all remaining text
3. WHEN an Entry_Line contains fewer than three tokens, THE Parser SHALL report a parse error identifying the line number and content
4. THE Parser SHALL ignore empty lines and lines containing only whitespace within the Bulk_Input
5. FOR ALL valid Bulk_Input values, parsing then formatting then parsing SHALL produce an equivalent list of entries (round-trip property)

### Requirement 3: Bulk Input Validation

**User Story:** As a streamer, I want immediate feedback if any of my entries have errors, so that I can correct them before resubmitting.

#### Acceptance Criteria

1. WHEN an Entry_Line contains a day value that is not one of Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, or Sunday (case-insensitive), THE Validator SHALL report an error identifying the 1-based line number and the invalid day value provided
2. WHEN an Entry_Line contains a time value that does not match the 24-hour HH:MM format (00:00 through 23:59), THE Validator SHALL report an error identifying the 1-based line number and the invalid time value provided
3. WHEN an Entry_Line contains a title that is empty (0 characters) or exceeds 100 characters, THE Validator SHALL report an error identifying the 1-based line number and indicating whether the title is empty or exceeds the maximum length
4. WHEN the Bulk_Input contains one or more invalid Entry_Lines, THE Bot SHALL reply with all accumulated validation errors in a single ephemeral message and SHALL NOT store any entries from that submission
5. THE Validator SHALL accept day values case-insensitively (e.g., "monday", "Monday", "MONDAY" are equivalent)
6. WHEN the number of valid entries in a Bulk_Input would cause the user to exceed 20 entries for the current week, THE Bot SHALL reply with an error indicating the current entry count and the maximum of 20, and SHALL NOT store any entries from that submission
7. WHEN a Bulk_Input contains more than 20 Entry_Lines, THE Validator SHALL report an error indicating the maximum of 20 Entry_Lines per submission was exceeded and SHALL NOT process the input

### Requirement 4: Bulk Entry Storage

**User Story:** As a streamer, I want all my valid entries stored at once, so that my schedule is consistent and complete.

#### Acceptance Criteria

1. WHEN all Entry_Lines pass validation, THE Schedule_Service SHALL store each entry for the current Week_Id using the existing addEntry method within a single database transaction, so that either all entries are persisted or none are
2. IF storing the bulk entries would cause the user's total entry count for the current week to exceed 20 after accounting for entries that would be replaced by UPSERT (same day and start time), THEN THE Bot SHALL reject the entire bulk submission and reply with an ephemeral error message indicating the limit has been exceeded
3. THE Bot SHALL calculate the net new entry count as: (number of submitted entries) minus (number of submitted entries that match an existing entry's day and start time for the same user and week), and verify that existing entry count plus net new entry count does not exceed 20 before storing any entries
4. WHEN bulk entries are stored successfully, THE Bot SHALL reply with an ephemeral confirmation message stating the number of entries added (e.g., "5 entries added to your schedule")
5. THE Schedule_Service SHALL apply UPSERT semantics to each bulk entry, replacing the title of any existing entry that matches the same guild, user, day, start time, and week_id
6. IF any entry fails to store during the bulk transaction, THEN THE Schedule_Service SHALL roll back all entries from that submission and THE Bot SHALL reply with an ephemeral error message indicating the storage failure

### Requirement 5: Bulk Input Formatting (Pretty Printer)

**User Story:** As a developer, I want to format structured schedule entries back into the bulk input text format, so that round-trip correctness can be verified.

#### Acceptance Criteria

1. THE Pretty_Printer SHALL format a list of structured schedule entries into Bulk_Input text by joining one Entry_Line per entry with a newline character, producing an empty string when the list is empty
2. THE Pretty_Printer SHALL format each Entry_Line as `Day HH:MM Title` where Day and HH:MM are each followed by a single space, and Title is all remaining text to end-of-line (may contain spaces)
3. THE Pretty_Printer SHALL produce output that, when parsed back into structured entries, yields a list with identical day, startTime, and title field values in the same order as the input list (round-trip property)

### Requirement 6: Confirmation and Error Response

**User Story:** As a streamer, I want clear feedback after submitting my bulk schedule, so that I know exactly what was saved or what went wrong.

#### Acceptance Criteria

1. WHEN bulk entry storage succeeds, THE Bot SHALL reply with an ephemeral message containing the count of entries added in the current operation and the Week_Id they were assigned to
2. WHEN bulk entry storage succeeds, THE Bot SHALL list each stored entry in the confirmation showing day, time, and title, with one entry per line, ordered by day then time
3. IF the confirmation or error message would exceed 2000 characters, THEN THE Bot SHALL truncate the entry list and append a line indicating the number of additional entries not shown
4. WHEN validation fails for one or more Entry_Lines, THE Bot SHALL reply with an ephemeral message listing each error on its own line, prefixed with the 1-based line number of the failing Entry_Line (e.g., "Line 3: ...")
5. IF the Bulk_Input contains a mix of valid and invalid Entry_Lines, THEN THE Bot SHALL reject the entire submission and display only the validation errors without storing any entries
6. WHEN the Bulk_Input contains no valid Entry_Lines (all empty or whitespace), THE Bot SHALL reply with an ephemeral error message indicating that no entries were provided

### Requirement 7: Guild Configuration Dependency

**User Story:** As a streamer, I want my bulk entries assigned to the correct week, so that they appear in the right weekly schedule post.

#### Acceptance Criteria

1. THE Bot SHALL resolve the current Week_Id in YYYY-Www format (ISO 8601 week date) by determining the next posting date from the guild's configured posting day and posting time, where entries submitted before the posting time are assigned to the current posting cycle's week and entries submitted at or after the posting time are assigned to the next posting cycle's week
2. IF the guild has no posting day configured or no posting time configured, THEN THE Bot SHALL use Monday at 09:00 UTC as the default value for the missing field when calculating the Week_Id
3. THE Bot SHALL perform all Week_Id calculations using UTC timestamps
