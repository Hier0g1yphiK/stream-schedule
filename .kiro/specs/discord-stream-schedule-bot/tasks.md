# Implementation Plan: Discord Stream Schedule Bot

## Overview

Build a Discord bot using TypeScript, discord.js v14, better-sqlite3, and node-cron that enables server admins to configure weekly schedule posting and allows streamers to submit their stream times. The bot compiles and posts the schedule automatically at the configured day and time.

## Tasks

- [x] 1. Set up project structure and core interfaces
  - [x] 1.1 Initialize Node.js project with TypeScript configuration
    - Create `package.json` with dependencies (discord.js, better-sqlite3, node-cron, dotenv)
    - Create `tsconfig.json` with strict mode, ES2022 target, Node module resolution
    - Create `.env.example` with `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` placeholders
    - Set up `src/` directory structure: `commands/`, `services/`, `database/`, `utils/`, `types/`
    - Add dev dependencies: typescript, vitest, fast-check, @types/better-sqlite3, @types/node
    - _Requirements: All_

  - [x] 1.2 Define shared types and enums
    - Create `src/types/index.ts` with `DayOfWeek` enum, `SetupConfiguration`, `ScheduleEntry`, `ValidationResult` interfaces
    - Create `src/types/commands.ts` with command option type definitions
    - _Requirements: 2.1, 3.1, 4.2_

  - [x] 1.3 Create database initialization module
    - Create `src/database/init.ts` that initializes SQLite database with better-sqlite3
    - Create `guild_config` and `schedule_entries` tables with proper schema
    - Add indexes for `guild_id + week_id` and `guild_id + user_id + week_id`
    - Add UNIQUE constraint on `(guild_id, user_id, day, start_time, week_id)`
    - _Requirements: 1.2, 2.2, 3.2, 4.1_

- [x] 2. Implement validation module
  - [x] 2.1 Implement time, day, and entry validators
    - Create `src/utils/validators.ts`
    - Implement `validateTime(input: string): ValidationResult` — accepts HH:MM where HH is 00–23, MM is 00–59
    - Implement `validateDay(input: string): ValidationResult` — accepts case-insensitive day names
    - Implement `validateTitle(input: string): ValidationResult` — accepts 1–100 character strings
    - Implement `validateEntry(day, time, title): ValidationResult` — combines all three validators
    - _Requirements: 2.3, 3.1, 3.3, 4.2, 4.6_

  - [x] 2.2 Write property tests for time validation
    - **Property 2: Time format validation**
    - **Validates: Requirements 3.1, 3.3**

  - [x] 2.3 Write property tests for day validation
    - **Property 3: Day validation rejects invalid inputs**
    - **Validates: Requirements 2.3**

  - [x] 2.4 Write property tests for entry validation
    - **Property 5: Schedule entry validation**
    - **Validates: Requirements 4.2, 4.6**

- [x] 3. Implement ConfigService
  - [x] 3.1 Implement ConfigService with SQLite persistence
    - Create `src/services/config-service.ts`
    - Implement `getConfig(guildId)` — returns stored configuration or defaults
    - Implement `setChannel(guildId, channelId)` — upserts channel_id in guild_config
    - Implement `setPostingDay(guildId, day)` — upserts posting_day in guild_config
    - Implement `setPostingTime(guildId, time)` — upserts posting_time in guild_config
    - Implement `isComplete(guildId)` — returns true when all three fields are set
    - _Requirements: 1.2, 2.2, 3.2, 6.1_

  - [x] 3.2 Write property tests for configuration round-trip
    - **Property 1: Configuration round-trip**
    - **Validates: Requirements 1.2, 2.2, 3.2**

  - [x] 3.3 Write property tests for partial config update
    - **Property 10: Partial config update preserves other fields**
    - **Validates: Requirements 6.1**

  - [x] 3.4 Write property tests for config summary
    - **Property 4: Configuration summary contains all values**
    - **Validates: Requirements 3.4, 6.5**

- [x] 4. Checkpoint - Verify foundation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement WeekCalculator
  - [x] 5.1 Implement week boundary and posting time logic
    - Create `src/utils/week-calculator.ts`
    - Implement `getCurrentWeekId(postingDay, postingTime)` — returns ISO week string (YYYY-Www)
    - Implement `getNextPostingDate(postingDay, postingTime, from?)` — computes next posting Date
    - Implement `isPostingTime(postingDay, postingTime, now?)` — true if now is within 5-minute window of configured time
    - Implement `hasPostingTimePassed(postingDay, postingTime, now?)` — true if posting time has already passed this week
    - _Requirements: 4.1, 4.5, 5.1, 6.3, 6.4_

  - [x] 5.2 Write property tests for week boundary assignment
    - **Property 6: Week boundary assignment**
    - **Validates: Requirements 4.1, 4.5**

  - [x] 5.3 Write property tests for next posting time computation
    - **Property 12: Next posting time computation**
    - **Validates: Requirements 6.4**

- [x] 6. Implement ScheduleService
  - [x] 6.1 Implement ScheduleService with SQLite persistence
    - Create `src/services/schedule-service.ts`
    - Implement `addEntry(guildId, userId, username, day, startTime, title)` — inserts or replaces (UPSERT on unique constraint)
    - Implement `removeEntry(guildId, userId, day, startTime)` — deletes matching entry for current week
    - Implement `getEntriesForWeek(guildId, weekId)` — returns all entries for given week
    - Implement `getEntriesForUser(guildId, userId, weekId)` — returns user's entries for given week
    - Implement `getEntryCount(guildId, userId, weekId)` — returns count, enforce max 20 per streamer
    - Implement `clearWeek(guildId, weekId)` — deletes all entries for the specified week
    - _Requirements: 4.1, 4.3, 4.4, 5.4_

  - [x] 6.2 Write property tests for entry replacement on duplicate
    - **Property 7: Entry replacement on duplicate day and time**
    - **Validates: Requirements 4.4**

  - [x] 6.3 Write property tests for config modification preserving entries
    - **Property 11: Config modification preserves schedule entries**
    - **Validates: Requirements 6.2**

- [x] 7. Implement PostingService
  - [x] 7.1 Implement schedule formatting logic
    - Create `src/services/posting-service.ts`
    - Implement `formatSchedule(entries)` — groups entries by day (Monday–Sunday order), sorts by start time within each day, formats with streamer name, time, and title
    - Handle empty schedule case with "no streams scheduled" message
    - _Requirements: 5.2, 5.3_

  - [x] 7.2 Implement posting logic with retry
    - Implement `checkAndPost()` — queries guilds where posting time matches, attempts to post
    - Implement `postSchedule(guildId)` — sends formatted schedule to target channel
    - Implement retry logic: on failure, wait 1 minute, retry once, DM admin on second failure
    - Handle incomplete config by skipping and DM-ing admin
    - After successful post, call `clearWeek()` to reset entries
    - _Requirements: 5.1, 5.4, 5.5, 5.6_

  - [x] 7.3 Write property tests for schedule formatting
    - **Property 8: Schedule formatting — grouped by day, sorted by time**
    - **Validates: Requirements 5.2**

  - [x] 7.4 Write property tests for schedule cleared after posting
    - **Property 9: Schedule cleared after posting**
    - **Validates: Requirements 5.4**

  - [x] 7.5 Write property tests for entry confirmation messages
    - **Property 13: Entry confirmation contains submitted details**
    - **Validates: Requirements 4.7**

- [x] 8. Checkpoint - Verify services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement slash commands
  - [x] 9.1 Create command registration and handler infrastructure
    - Create `src/commands/index.ts` — command registry and loader
    - Create `src/commands/deploy-commands.ts` — script to register slash commands with Discord
    - Define `/schedule` command group with subcommands: `setup`, `add`, `remove`, `mine`
    - _Requirements: 1.4, 1.5_

  - [x] 9.2 Implement setup subcommands
    - Create `src/commands/setup.ts`
    - Implement `setup channel` — accepts TextChannel option, validates bot permissions, calls ConfigService.setChannel
    - Implement `setup day` — presents day choices, calls ConfigService.setPostingDay
    - Implement `setup time` — accepts time string, validates format, calls ConfigService.setPostingTime
    - Implement `setup view` — displays current config summary
    - Enforce administrator permission on all setup subcommands
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 6.1, 6.5_

  - [x] 9.3 Implement schedule add and remove commands
    - Create `src/commands/schedule.ts`
    - Implement `/schedule add` — accepts day (choice), time (string), title (string), validates input, checks entry limit (20), calls ScheduleService.addEntry, returns confirmation
    - Implement `/schedule remove` — accepts day (choice) and time (string), calls ScheduleService.removeEntry
    - Implement `/schedule mine` — calls ScheduleService.getEntriesForUser, displays user's entries
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 10. Implement scheduler and bot entry point
  - [x] 10.1 Create cron scheduler
    - Create `src/scheduler.ts`
    - Set up node-cron job running every minute (`* * * * *`)
    - On each tick, call `PostingService.checkAndPost()`
    - _Requirements: 5.1_

  - [x] 10.2 Create bot entry point and client setup
    - Create `src/index.ts` — main entry point
    - Initialize Discord client with required intents (Guilds, GuildMessages)
    - Load and register command handlers on `interactionCreate` event
    - Initialize database on startup
    - Start cron scheduler after client is ready
    - Handle graceful shutdown (close DB, destroy client)
    - _Requirements: All_

- [x] 11. Checkpoint - Verify full integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Add integration tests and final wiring
  - [x] 12.1 Write integration tests for setup flow
    - Test full setup command flow with mocked Discord interactions
    - Verify permission checks (admin vs non-admin)
    - Verify channel permission validation
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [x] 12.2 Write integration tests for schedule posting flow
    - Test end-to-end flow: add entries → posting time arrives → schedule posts → entries cleared
    - Verify empty schedule posts "no streams scheduled" message
    - Verify retry logic with simulated failures
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The bot uses TypeScript throughout as specified in the design
- All times are handled in UTC as per the requirements
- The database uses better-sqlite3 for synchronous, zero-config persistence

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "3.1", "5.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "3.4", "5.2", "5.3", "6.1"] },
    { "id": 4, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4", "7.5"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3"] },
    { "id": 8, "tasks": ["10.1", "10.2"] },
    { "id": 9, "tasks": ["12.1", "12.2"] }
  ]
}
```
