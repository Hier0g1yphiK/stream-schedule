import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ConfigService } from '../../src/services/config-service';
import { initializeTestDatabase } from '../../src/database/init';
import { DayOfWeek } from '../../src/types/index';
import Database from 'better-sqlite3';

// Feature: discord-stream-schedule-bot, Property 10: Partial config update preserves other fields
// **Validates: Requirements 6.1**

const ALL_DAYS = Object.values(DayOfWeek);

/**
 * Arbitrary for a valid guild ID (non-empty alphanumeric string resembling a Discord snowflake).
 */
const guildIdArbitrary = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 17, maxLength: 20 });

/**
 * Arbitrary for a valid channel ID (Discord snowflake-like numeric string).
 */
const channelIdArbitrary = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 17, maxLength: 20 });

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

describe('Property 10: Partial config update preserves other fields', () => {
  let db: Database.Database;
  let configService: ConfigService;

  beforeEach(() => {
    db = initializeTestDatabase();
    configService = new ConfigService(db);
  });

  it('updating only channel preserves day and time', () => {
    fc.assert(
      fc.property(
        guildIdArbitrary,
        channelIdArbitrary,
        dayArbitrary,
        timeArbitrary,
        channelIdArbitrary,
        (guildId, originalChannel, originalDay, originalTime, newChannel) => {
          // Set up complete config
          configService.setChannel(guildId, originalChannel);
          configService.setPostingDay(guildId, originalDay);
          configService.setPostingTime(guildId, originalTime);

          // Update only channel
          configService.setChannel(guildId, newChannel);

          // Verify other fields are preserved
          const config = configService.getConfig(guildId);
          expect(config.postingDay).toBe(originalDay);
          expect(config.postingTime).toBe(originalTime);
          expect(config.channelId).toBe(newChannel);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('updating only day preserves channel and time', () => {
    fc.assert(
      fc.property(
        guildIdArbitrary,
        channelIdArbitrary,
        dayArbitrary,
        timeArbitrary,
        dayArbitrary,
        (guildId, originalChannel, originalDay, originalTime, newDay) => {
          // Set up complete config
          configService.setChannel(guildId, originalChannel);
          configService.setPostingDay(guildId, originalDay);
          configService.setPostingTime(guildId, originalTime);

          // Update only day
          configService.setPostingDay(guildId, newDay);

          // Verify other fields are preserved
          const config = configService.getConfig(guildId);
          expect(config.channelId).toBe(originalChannel);
          expect(config.postingTime).toBe(originalTime);
          expect(config.postingDay).toBe(newDay);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('updating only time preserves channel and day', () => {
    fc.assert(
      fc.property(
        guildIdArbitrary,
        channelIdArbitrary,
        dayArbitrary,
        timeArbitrary,
        timeArbitrary,
        (guildId, originalChannel, originalDay, originalTime, newTime) => {
          // Set up complete config
          configService.setChannel(guildId, originalChannel);
          configService.setPostingDay(guildId, originalDay);
          configService.setPostingTime(guildId, originalTime);

          // Update only time
          configService.setPostingTime(guildId, newTime);

          // Verify other fields are preserved
          const config = configService.getConfig(guildId);
          expect(config.channelId).toBe(originalChannel);
          expect(config.postingDay).toBe(originalDay);
          expect(config.postingTime).toBe(newTime);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: discord-stream-schedule-bot, Property 4: Configuration summary contains all values
// **Validates: Requirements 3.4, 6.5**

import { formatConfigSummary } from '../../src/utils/format-config';

/**
 * Arbitrary for a valid channel name (non-empty alphanumeric string with hyphens,
 * mimicking Discord channel names).
 */
const channelNameArbitrary = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
  { minLength: 1, maxLength: 30 }
);

/**
 * Arbitrary for a valid posting day.
 */
const postingDayArbitrary = fc.constantFrom(
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
);

/**
 * Arbitrary for a valid posting time in HH:MM format.
 */
const postingTimeArbitrary = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

describe('Property 4: Configuration summary contains all values', () => {
  it('formatted summary contains the channel name', () => {
    fc.assert(
      fc.property(
        channelNameArbitrary,
        postingDayArbitrary,
        postingTimeArbitrary,
        (channelName, postingDay, postingTime) => {
          const summary = formatConfigSummary(channelName, postingDay, postingTime);
          expect(summary).toContain(channelName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('formatted summary contains the posting day', () => {
    fc.assert(
      fc.property(
        channelNameArbitrary,
        postingDayArbitrary,
        postingTimeArbitrary,
        (channelName, postingDay, postingTime) => {
          const summary = formatConfigSummary(channelName, postingDay, postingTime);
          expect(summary).toContain(postingDay);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('formatted summary contains the posting time', () => {
    fc.assert(
      fc.property(
        channelNameArbitrary,
        postingDayArbitrary,
        postingTimeArbitrary,
        (channelName, postingDay, postingTime) => {
          const summary = formatConfigSummary(channelName, postingDay, postingTime);
          expect(summary).toContain(postingTime);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all three values are present simultaneously in the summary', () => {
    fc.assert(
      fc.property(
        channelNameArbitrary,
        postingDayArbitrary,
        postingTimeArbitrary,
        (channelName, postingDay, postingTime) => {
          const summary = formatConfigSummary(channelName, postingDay, postingTime);
          expect(summary).toContain(channelName);
          expect(summary).toContain(postingDay);
          expect(summary).toContain(postingTime);
        }
      ),
      { numRuns: 100 }
    );
  });
});
