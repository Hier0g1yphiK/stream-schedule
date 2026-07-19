import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ScheduleService } from '../../src/services/schedule-service';
import { initializeTestDatabase } from '../../src/database/init';
import { DayOfWeek } from '../../src/types/index';
import Database from 'better-sqlite3';

// Feature: discord-stream-schedule-bot, Property 9: Schedule cleared after posting
// **Validates: Requirements 5.4**

const ALL_DAYS = Object.values(DayOfWeek);

/**
 * Arbitrary for a valid guild ID (Discord snowflake-like numeric string).
 */
const guildIdArbitrary = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 17, maxLength: 20 });

/**
 * Arbitrary for a valid user ID (Discord snowflake-like numeric string).
 */
const userIdArbitrary = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 17, maxLength: 20 });

/**
 * Arbitrary for a valid username (non-empty alphanumeric string).
 */
const usernameArbitrary = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
  { minLength: 3, maxLength: 20 }
);

/**
 * Arbitrary for a valid DayOfWeek enum value.
 */
const dayArbitrary = fc.constantFrom(...ALL_DAYS);

/**
 * Arbitrary for a valid HH:MM time string.
 */
const timeArbitrary = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

/**
 * Arbitrary for a valid stream title (1-100 characters).
 */
const titleArbitrary = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
  { minLength: 1, maxLength: 50 }
);

/**
 * Arbitrary for a valid week ID in ISO 8601 format (e.g. "2024-W03").
 */
const weekIdArbitrary = fc
  .tuple(fc.integer({ min: 2020, max: 2030 }), fc.integer({ min: 1, max: 52 }))
  .map(([year, week]) => `${year}-W${week.toString().padStart(2, '0')}`);

/**
 * Arbitrary for a schedule entry input (for creation).
 */
const entryInputArbitrary = fc.record({
  userId: userIdArbitrary,
  username: usernameArbitrary,
  day: dayArbitrary,
  startTime: timeArbitrary,
  title: titleArbitrary,
});

describe('Property 9: Schedule cleared after posting', () => {
  let db: Database.Database;
  let scheduleService: ScheduleService;

  beforeEach(() => {
    db = initializeTestDatabase();
    scheduleService = new ScheduleService(db);
  });

  it('after clearWeek is called, getEntriesForWeek returns an empty array', () => {
    fc.assert(
      fc.property(
        guildIdArbitrary,
        weekIdArbitrary,
        fc.array(entryInputArbitrary, { minLength: 1, maxLength: 10 }),
        (guildId, weekId, entries) => {
          // Add entries to populate the schedule
          for (const entry of entries) {
            scheduleService.addEntry(
              guildId,
              entry.userId,
              entry.username,
              entry.day,
              entry.startTime,
              entry.title,
              weekId
            );
          }

          // Verify entries exist before clearing
          const entriesBefore = scheduleService.getEntriesForWeek(guildId, weekId);
          expect(entriesBefore.length).toBeGreaterThan(0);

          // Simulate successful post by clearing the week
          scheduleService.clearWeek(guildId, weekId);

          // After clearing, querying entries for that week should return empty
          const entriesAfter = scheduleService.getEntriesForWeek(guildId, weekId);
          expect(entriesAfter).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('other weeks entries are not affected by clearWeek', () => {
    fc.assert(
      fc.property(
        guildIdArbitrary,
        weekIdArbitrary,
        weekIdArbitrary,
        fc.array(entryInputArbitrary, { minLength: 1, maxLength: 5 }),
        fc.array(entryInputArbitrary, { minLength: 1, maxLength: 5 }),
        (guildId, weekId1, weekId2, entriesWeek1, entriesWeek2) => {
          // Ensure the two week IDs are different
          fc.pre(weekId1 !== weekId2);

          // Add entries for week 1
          for (const entry of entriesWeek1) {
            scheduleService.addEntry(
              guildId,
              entry.userId,
              entry.username,
              entry.day,
              entry.startTime,
              entry.title,
              weekId1
            );
          }

          // Add entries for week 2
          for (const entry of entriesWeek2) {
            scheduleService.addEntry(
              guildId,
              entry.userId,
              entry.username,
              entry.day,
              entry.startTime,
              entry.title,
              weekId2
            );
          }

          // Capture week 2 entries before clearing week 1
          const week2Before = scheduleService.getEntriesForWeek(guildId, weekId2);

          // Clear week 1 (simulating successful post for week 1)
          scheduleService.clearWeek(guildId, weekId1);

          // Week 1 should be empty
          const week1After = scheduleService.getEntriesForWeek(guildId, weekId1);
          expect(week1After).toEqual([]);

          // Week 2 entries should remain unchanged
          const week2After = scheduleService.getEntriesForWeek(guildId, weekId2);
          expect(week2After.length).toBe(week2Before.length);

          // Verify each entry in week 2 still exists
          for (const entry of week2Before) {
            const found = week2After.find(
              (e) =>
                e.userId === entry.userId &&
                e.day === entry.day &&
                e.startTime === entry.startTime &&
                e.title === entry.title
            );
            expect(found).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('other guilds entries are not affected by clearWeek', () => {
    fc.assert(
      fc.property(
        guildIdArbitrary,
        guildIdArbitrary,
        weekIdArbitrary,
        fc.array(entryInputArbitrary, { minLength: 1, maxLength: 5 }),
        fc.array(entryInputArbitrary, { minLength: 1, maxLength: 5 }),
        (guildId1, guildId2, weekId, entriesGuild1, entriesGuild2) => {
          // Ensure the two guild IDs are different
          fc.pre(guildId1 !== guildId2);

          // Add entries for guild 1
          for (const entry of entriesGuild1) {
            scheduleService.addEntry(
              guildId1,
              entry.userId,
              entry.username,
              entry.day,
              entry.startTime,
              entry.title,
              weekId
            );
          }

          // Add entries for guild 2
          for (const entry of entriesGuild2) {
            scheduleService.addEntry(
              guildId2,
              entry.userId,
              entry.username,
              entry.day,
              entry.startTime,
              entry.title,
              weekId
            );
          }

          // Capture guild 2 entries before clearing guild 1
          const guild2Before = scheduleService.getEntriesForWeek(guildId2, weekId);

          // Clear week for guild 1 only
          scheduleService.clearWeek(guildId1, weekId);

          // Guild 1 should be empty
          const guild1After = scheduleService.getEntriesForWeek(guildId1, weekId);
          expect(guild1After).toEqual([]);

          // Guild 2 entries should remain unchanged
          const guild2After = scheduleService.getEntriesForWeek(guildId2, weekId);
          expect(guild2After.length).toBe(guild2Before.length);

          // Verify each entry in guild 2 still exists
          for (const entry of guild2Before) {
            const found = guild2After.find(
              (e) =>
                e.userId === entry.userId &&
                e.day === entry.day &&
                e.startTime === entry.startTime &&
                e.title === entry.title
            );
            expect(found).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// Feature: discord-stream-schedule-bot, Property 13: Entry confirmation contains submitted details
// **Validates: Requirements 4.7**

import { formatEntryConfirmation } from '../../src/utils/format-config';

/**
 * Arbitrary for a valid DayOfWeek enum value (for confirmation tests).
 */
const confirmDayArbitrary = fc.constantFrom(...ALL_DAYS);

/**
 * Arbitrary for a valid HH:MM time string (for confirmation tests).
 */
const confirmTimeArbitrary = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

/**
 * Arbitrary for a valid stream title (1-100 printable characters, no newlines).
 */
const confirmTitleArbitrary = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !@#$%&()-_=+[]{}:;,.<>?'.split('')
  ),
  { minLength: 1, maxLength: 100 }
);

describe('Property 13: Entry confirmation contains submitted details', () => {
  it('confirmation message contains the entry day', () => {
    fc.assert(
      fc.property(
        confirmDayArbitrary,
        confirmTimeArbitrary,
        confirmTitleArbitrary,
        (day, startTime, title) => {
          const message = formatEntryConfirmation(day, startTime, title);
          expect(message).toContain(day);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('confirmation message contains the entry start time', () => {
    fc.assert(
      fc.property(
        confirmDayArbitrary,
        confirmTimeArbitrary,
        confirmTitleArbitrary,
        (day, startTime, title) => {
          const message = formatEntryConfirmation(day, startTime, title);
          expect(message).toContain(startTime);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('confirmation message contains the entry title', () => {
    fc.assert(
      fc.property(
        confirmDayArbitrary,
        confirmTimeArbitrary,
        confirmTitleArbitrary,
        (day, startTime, title) => {
          const message = formatEntryConfirmation(day, startTime, title);
          expect(message).toContain(title);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all three values (day, start time, title) are present simultaneously', () => {
    fc.assert(
      fc.property(
        confirmDayArbitrary,
        confirmTimeArbitrary,
        confirmTitleArbitrary,
        (day, startTime, title) => {
          const message = formatEntryConfirmation(day, startTime, title);
          expect(message).toContain(day);
          expect(message).toContain(startTime);
          expect(message).toContain(title);
        }
      ),
      { numRuns: 100 }
    );
  });
});
