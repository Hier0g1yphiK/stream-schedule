// Feature: bulk-schedule-command, Property 7: Net New Count Enforcement
import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ScheduleService } from '../../src/services/schedule-service';
import { initializeTestDatabase } from '../../src/database/init';
import { NormalizedEntry } from '../../src/utils/bulk-validator';
import { DayOfWeek } from '../../src/types';
import Database from 'better-sqlite3';

// **Validates: Requirements 3.6, 4.2, 4.3**

const ALL_DAYS = Object.values(DayOfWeek);

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
 * Arbitrary for a valid stream title (1-100 characters, no newlines).
 */
const titleArbitrary = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
  { minLength: 1, maxLength: 50 }
);

/**
 * Generates a unique (day, startTime) pair for use as an entry slot.
 * We use an index-based approach to guarantee uniqueness.
 */
function generateUniqueSlots(count: number): fc.Arbitrary<{ day: DayOfWeek; startTime: string }[]> {
  // There are 7 days * 1440 minutes = 10080 unique slots available
  // We generate unique indices into this space
  return fc
    .uniqueArray(fc.integer({ min: 0, max: 7 * 24 * 60 - 1 }), { minLength: count, maxLength: count })
    .map((indices) =>
      indices.map((idx) => {
        const dayIndex = Math.floor(idx / (24 * 60));
        const minuteOfDay = idx % (24 * 60);
        const hour = Math.floor(minuteOfDay / 60);
        const minute = minuteOfDay % 60;
        return {
          day: ALL_DAYS[dayIndex % 7],
          startTime: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
        };
      })
    );
}

describe('Property 7: Net New Count Enforcement', () => {
  const GUILD_ID = '123456789012345678';
  const USER_ID = '987654321098765432';
  const USERNAME = 'teststreamer';
  const WEEK_ID = '2024-W10';

  it('accepts submission when E + (|S| - R) <= 20 and rejects when E + (|S| - R) > 20', () => {
    fc.assert(
      fc.property(
        // E: existing entry count (0-20)
        fc.integer({ min: 0, max: 20 }),
        // Total submitted entries (1-20)
        fc.integer({ min: 1, max: 20 }),
        // Fraction of submitted entries that are replacements (0.0-1.0)
        fc.double({ min: 0, max: 1, noNaN: true }),
        // Whether to force the scenario to exceed the limit or not
        fc.boolean(),
        (existingCount, submittedCount, replaceFraction, forceExceed) => {
          // Fresh database for each iteration
          const db = initializeTestDatabase();
          const service = new ScheduleService(db);

          // Calculate replacement count (can't exceed existing or submitted)
          let replacements = Math.min(
            Math.floor(replaceFraction * submittedCount),
            existingCount
          );

          // Calculate net new
          let netNew = submittedCount - replacements;

          // If forceExceed, adjust to ensure we exceed the limit
          // If !forceExceed, adjust to ensure we stay within the limit
          if (forceExceed) {
            // Ensure E + netNew > 20
            if (existingCount + netNew <= 20) {
              // Reduce replacements to increase netNew
              const neededNetNew = 21 - existingCount;
              if (neededNetNew > submittedCount) {
                // Can't exceed with these parameters, skip
                return;
              }
              replacements = submittedCount - neededNetNew;
              if (replacements < 0 || replacements > existingCount) {
                return; // Invalid combo, skip
              }
              netNew = submittedCount - replacements;
            }
          } else {
            // Ensure E + netNew <= 20
            if (existingCount + netNew > 20) {
              // Increase replacements to reduce netNew
              const maxNetNew = 20 - existingCount;
              if (maxNetNew < 0) {
                return; // Can't fit, skip
              }
              replacements = submittedCount - maxNetNew;
              if (replacements < 0 || replacements > existingCount) {
                return; // Invalid combo, skip
              }
              netNew = submittedCount - replacements;
            }
          }

          // We need existingCount unique slots total for existing entries,
          // plus (submittedCount - replacements) additional unique slots for new entries
          const totalSlotsNeeded = existingCount + (submittedCount - replacements);
          if (totalSlotsNeeded > 7 * 24 * 60) {
            return; // Not enough unique slots available
          }

          // Generate all unique slots we need
          // First `existingCount` slots are for existing entries
          // First `replacements` of those will also be used in submissions
          // Remaining submitted entries use fresh slots
          const allSlots: { day: DayOfWeek; startTime: string }[] = [];
          const usedKeys = new Set<string>();

          // Generate existing slots deterministically using a simple pattern
          for (let i = 0; i < existingCount; i++) {
            const dayIndex = Math.floor(i / (24 * 60)) % 7;
            const minuteOfDay = i % (24 * 60);
            const hour = Math.floor(minuteOfDay / 60);
            const minute = minuteOfDay % 60;
            const day = ALL_DAYS[dayIndex];
            const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            allSlots.push({ day, startTime });
            usedKeys.add(`${day}-${startTime}`);
          }

          // Insert existing entries directly
          for (let i = 0; i < existingCount; i++) {
            service.addEntry(
              GUILD_ID,
              USER_ID,
              USERNAME,
              allSlots[i].day,
              allSlots[i].startTime,
              `Existing Stream ${i}`,
              WEEK_ID
            );
          }

          // Build submitted entries
          const submittedEntries: NormalizedEntry[] = [];

          // First `replacements` entries overlap with existing
          for (let i = 0; i < replacements; i++) {
            submittedEntries.push({
              day: allSlots[i].day,
              startTime: allSlots[i].startTime,
              title: `Updated Stream ${i}`,
              lineNumber: i + 1,
            });
          }

          // Remaining entries are net-new (use slots that don't conflict)
          let slotOffset = existingCount;
          for (let i = replacements; i < submittedCount; i++) {
            // Find next unused slot
            let dayIndex = Math.floor(slotOffset / (24 * 60)) % 7;
            let minuteOfDay = slotOffset % (24 * 60);
            let hour = Math.floor(minuteOfDay / 60);
            let minute = minuteOfDay % 60;
            let day = ALL_DAYS[dayIndex];
            let startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

            while (usedKeys.has(`${day}-${startTime}`)) {
              slotOffset++;
              dayIndex = Math.floor(slotOffset / (24 * 60)) % 7;
              minuteOfDay = slotOffset % (24 * 60);
              hour = Math.floor(minuteOfDay / 60);
              minute = minuteOfDay % 60;
              day = ALL_DAYS[dayIndex];
              startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            }

            usedKeys.add(`${day}-${startTime}`);
            submittedEntries.push({
              day,
              startTime,
              title: `New Stream ${i}`,
              lineNumber: i + 1,
            });
            slotOffset++;
          }

          // Verify our setup is correct
          expect(submittedEntries.length).toBe(submittedCount);

          const shouldExceed = existingCount + netNew > 20;

          if (shouldExceed) {
            // Should throw and no entries should be changed
            const countBefore = service.getEntryCount(GUILD_ID, USER_ID, WEEK_ID);
            expect(countBefore).toBe(existingCount);

            expect(() =>
              service.bulkAddEntries(GUILD_ID, USER_ID, USERNAME, submittedEntries, WEEK_ID)
            ).toThrow();

            // Verify no entries were stored or modified
            const countAfter = service.getEntryCount(GUILD_ID, USER_ID, WEEK_ID);
            expect(countAfter).toBe(existingCount);
          } else {
            // Should succeed
            const result = service.bulkAddEntries(
              GUILD_ID,
              USER_ID,
              USERNAME,
              submittedEntries,
              WEEK_ID
            );

            expect(result).toBeDefined();
            expect(result.added).toBe(netNew);
            expect(result.replaced).toBe(replacements);

            // Final count should be existingCount + netNew
            const countAfter = service.getEntryCount(GUILD_ID, USER_ID, WEEK_ID);
            expect(countAfter).toBe(existingCount + netNew);
          }

          db.close();
        }
      ),
      { numRuns: 100 }
    );
  });
});
