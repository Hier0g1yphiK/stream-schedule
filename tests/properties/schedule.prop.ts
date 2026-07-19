import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ConfigService } from '../../src/services/config-service';
import { ScheduleService } from '../../src/services/schedule-service';
import { initializeTestDatabase } from '../../src/database/init';
import { DayOfWeek, ScheduleEntry } from '../../src/types/index';
import Database from 'better-sqlite3';

// Feature: discord-stream-schedule-bot, Property 11: Config modification preserves schedule entries
// **Validates: Requirements 6.2**

const ALL_DAYS = Object.values(DayOfWeek);

/**
 * Arbitrary for a valid guild ID (Discord snowflake-like numeric string).
 */
const guildIdArbitrary = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 17, maxLength: 20 });

/**
 * Arbitrary for a valid channel ID (Discord snowflake-like numeric string).
 */
const channelIdArbitrary = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 17, maxLength: 20 });

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
 * Arbitrary for a schedule entry (without id, for creation).
 */
const entryInputArbitrary = fc.record({
  userId: userIdArbitrary,
  username: usernameArbitrary,
  day: dayArbitrary,
  startTime: timeArbitrary,
  title: titleArbitrary,
});

/**
 * Helper to compare schedule entries ignoring order.
 * Compares by the unique key: userId + day + startTime + title.
 */
function entriesEqual(a: ScheduleEntry[], b: ScheduleEntry[]): boolean {
  if (a.length !== b.length) return false;

  const serialize = (e: ScheduleEntry) =>
    `${e.userId}|${e.day}|${e.startTime}|${e.title}|${e.username}`;

  const setA = new Set(a.map(serialize));
  const setB = new Set(b.map(serialize));

  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}

describe('Property 11: Config modification preserves schedule entries', () => {
  let db: Database.Database;
  let configService: ConfigService;
  let scheduleService: ScheduleService;

  beforeEach(() => {
    db = initializeTestDatabase();
    configService = new ConfigService(db);
    scheduleService = new ScheduleService(db);
  });

  it('modifying channel preserves all schedule entries', () => {
    fc.assert(
      fc.property(
        guildIdArbitrary,
        channelIdArbitrary,
        channelIdArbitrary,
        weekIdArbitrary,
        fc.array(entryInputArbitrary, { minLength: 1, maxLength: 5 }),
        (guildId, originalChannel, newChannel, weekId, entries) => {
          // Set up initial config
          configService.setChannel(guildId, originalChannel);
          configService.setPostingDay(guildId, DayOfWeek.Monday);
          configService.setPostingTime(guildId, '12:00');

          // Add schedule entries
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

          // Capture entries before config change
          const entriesBefore = scheduleService.getEntriesForWeek(guildId, weekId);

          // Modify channel
          configService.setChannel(guildId, newChannel);

          // Capture entries after config change
          const entriesAfter = scheduleService.getEntriesForWeek(guildId, weekId);

          // Entries should be identical
          expect(entriesEqual(entriesBefore, entriesAfter)).toBe(true);
          expect(entriesAfter.length).toBe(entriesBefore.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('modifying posting day preserves all schedule entries', () => {
    fc.assert(
      fc.property(
        guildIdArbitrary,
        channelIdArbitrary,
        dayArbitrary,
        dayArbitrary,
        weekIdArbitrary,
        fc.array(entryInputArbitrary, { minLength: 1, maxLength: 5 }),
        (guildId, channel, originalDay, newDay, weekId, entries) => {
          // Set up initial config
          configService.setChannel(guildId, channel);
          configService.setPostingDay(guildId, originalDay);
          configService.setPostingTime(guildId, '12:00');

          // Add schedule entries
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

          // Capture entries before config change
          const entriesBefore = scheduleService.getEntriesForWeek(guildId, weekId);

          // Modify posting day
          configService.setPostingDay(guildId, newDay);

          // Capture entries after config change
          const entriesAfter = scheduleService.getEntriesForWeek(guildId, weekId);

          // Entries should be identical
          expect(entriesEqual(entriesBefore, entriesAfter)).toBe(true);
          expect(entriesAfter.length).toBe(entriesBefore.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('modifying posting time preserves all schedule entries', () => {
    fc.assert(
      fc.property(
        guildIdArbitrary,
        channelIdArbitrary,
        dayArbitrary,
        timeArbitrary,
        timeArbitrary,
        weekIdArbitrary,
        fc.array(entryInputArbitrary, { minLength: 1, maxLength: 5 }),
        (guildId, channel, day, originalTime, newTime, weekId, entries) => {
          // Set up initial config
          configService.setChannel(guildId, channel);
          configService.setPostingDay(guildId, day);
          configService.setPostingTime(guildId, originalTime);

          // Add schedule entries
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

          // Capture entries before config change
          const entriesBefore = scheduleService.getEntriesForWeek(guildId, weekId);

          // Modify posting time
          configService.setPostingTime(guildId, newTime);

          // Capture entries after config change
          const entriesAfter = scheduleService.getEntriesForWeek(guildId, weekId);

          // Entries should be identical
          expect(entriesEqual(entriesBefore, entriesAfter)).toBe(true);
          expect(entriesAfter.length).toBe(entriesBefore.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
