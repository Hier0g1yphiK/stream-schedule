import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeTestDatabase } from '../../src/database/init';
import { ScheduleService } from '../../src/services/schedule-service';
import { parseBulkInput } from '../../src/utils/bulk-parser';
import { validateBulkEntries } from '../../src/utils/bulk-validator';
import { DayOfWeek } from '../../src/types';

/**
 * Integration tests for the full bulk schedule flow.
 * Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.6
 *
 * Tests the end-to-end pipeline: parse → validate → store → confirm.
 * Uses a real SQLite in-memory database.
 */
describe('Integration: Bulk Schedule Flow', () => {
  let db: Database.Database;
  let scheduleService: ScheduleService;

  const GUILD_ID = 'guild-bulk-test';
  const USER_ID = 'user-bulk-test';
  const USERNAME = 'BulkTester';
  const WEEK_ID = '2024-W10';

  beforeEach(() => {
    db = initializeTestDatabase();
    scheduleService = new ScheduleService(db);
  });

  describe('End-to-end happy path: parse → validate → store → confirm', () => {
    it('should parse, validate, and store multiple valid entries', () => {
      const input = [
        'Monday 09:00 Morning Art Stream',
        'Wednesday 14:00 Midweek Gaming',
        'Friday 20:00 Friday Night Chill',
      ].join('\n');

      // Step 1: Parse
      const parseResult = parseBulkInput(input);
      expect(parseResult.errors).toHaveLength(0);
      expect(parseResult.entries).toHaveLength(3);

      // Step 2: Validate
      const validationResult = validateBulkEntries(parseResult.entries);
      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
      expect(validationResult.normalizedEntries).toHaveLength(3);

      // Step 3: Store
      const bulkResult = scheduleService.bulkAddEntries(
        GUILD_ID,
        USER_ID,
        USERNAME,
        validationResult.normalizedEntries,
        WEEK_ID
      );

      // Step 4: Verify results
      expect(bulkResult.added).toBe(3);
      expect(bulkResult.replaced).toBe(0);
      expect(bulkResult.entries).toHaveLength(3);

      // Verify entries are actually in the database
      const storedEntries = scheduleService.getEntriesForUser(GUILD_ID, USER_ID, WEEK_ID);
      expect(storedEntries).toHaveLength(3);

      const monday = storedEntries.find((e) => e.day === DayOfWeek.Monday);
      expect(monday).toBeDefined();
      expect(monday!.startTime).toBe('09:00');
      expect(monday!.title).toBe('Morning Art Stream');

      const wednesday = storedEntries.find((e) => e.day === DayOfWeek.Wednesday);
      expect(wednesday).toBeDefined();
      expect(wednesday!.startTime).toBe('14:00');
      expect(wednesday!.title).toBe('Midweek Gaming');

      const friday = storedEntries.find((e) => e.day === DayOfWeek.Friday);
      expect(friday).toBeDefined();
      expect(friday!.startTime).toBe('20:00');
      expect(friday!.title).toBe('Friday Night Chill');
    });

    it('should handle case-insensitive day names in the full pipeline', () => {
      const input = 'tuesday 10:00 Casual Hangout\nTHURSDAY 18:30 Competitive Gaming';

      const parseResult = parseBulkInput(input);
      const validationResult = validateBulkEntries(parseResult.entries);
      expect(validationResult.valid).toBe(true);

      const bulkResult = scheduleService.bulkAddEntries(
        GUILD_ID,
        USER_ID,
        USERNAME,
        validationResult.normalizedEntries,
        WEEK_ID
      );

      expect(bulkResult.added).toBe(2);
      const storedEntries = scheduleService.getEntriesForUser(GUILD_ID, USER_ID, WEEK_ID);
      expect(storedEntries).toHaveLength(2);
      expect(storedEntries.some((e) => e.day === DayOfWeek.Tuesday)).toBe(true);
      expect(storedEntries.some((e) => e.day === DayOfWeek.Thursday)).toBe(true);
    });
  });

  describe('Transaction rollback on simulated failure', () => {
    it('should not store any entries when the transaction throws mid-way', () => {
      // Pre-populate the database to fill up to the limit so the next batch fails
      // We'll use a more direct approach: manually trigger a failure via the limit check
      const input = [
        'Monday 09:00 Stream One',
        'Wednesday 14:00 Stream Two',
        'Friday 20:00 Stream Three',
      ].join('\n');

      const parseResult = parseBulkInput(input);
      const validationResult = validateBulkEntries(parseResult.entries);

      // Store initial entries successfully
      scheduleService.bulkAddEntries(
        GUILD_ID,
        USER_ID,
        USERNAME,
        validationResult.normalizedEntries,
        WEEK_ID
      );
      expect(scheduleService.getEntryCount(GUILD_ID, USER_ID, WEEK_ID)).toBe(3);

      // Now simulate a failure by directly using the db transaction mechanism.
      // We insert entries in a transaction and throw mid-way to verify rollback.
      const upsertStmt = db.prepare(
        `INSERT INTO schedule_entries (guild_id, user_id, username, day, start_time, title, week_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      const failingTransaction = db.transaction(() => {
        upsertStmt.run(GUILD_ID, USER_ID, USERNAME, 'Saturday', '10:00', 'Should Not Persist', WEEK_ID);
        // Simulate mid-transaction failure
        throw new Error('Simulated database failure');
      });

      expect(() => failingTransaction()).toThrow('Simulated database failure');

      // Verify no new entries were stored (rollback happened)
      const count = scheduleService.getEntryCount(GUILD_ID, USER_ID, WEEK_ID);
      expect(count).toBe(3); // Still only the original 3
      const entries = scheduleService.getEntriesForUser(GUILD_ID, USER_ID, WEEK_ID);
      expect(entries.find((e) => e.day === DayOfWeek.Saturday)).toBeUndefined();
    });

    it('should roll back all entries when bulkAddEntries limit check fails', () => {
      // Fill up to 18 entries
      for (let i = 0; i < 18; i++) {
        const days = Object.values(DayOfWeek);
        const day = days[i % 7];
        const time = `${String(8 + Math.floor(i / 7)).padStart(2, '0')}:${String((i * 5) % 60).padStart(2, '0')}`;
        scheduleService.addEntry(GUILD_ID, USER_ID, USERNAME, day, time, `Entry ${i + 1}`, WEEK_ID);
      }
      expect(scheduleService.getEntryCount(GUILD_ID, USER_ID, WEEK_ID)).toBe(18);

      // Try to add 5 new entries (all different day/time combos) — should fail (18 + 5 = 23 > 20)
      const input = [
        'Monday 22:00 Late Night 1',
        'Tuesday 22:00 Late Night 2',
        'Wednesday 22:00 Late Night 3',
        'Thursday 22:00 Late Night 4',
        'Friday 22:00 Late Night 5',
      ].join('\n');

      const parseResult = parseBulkInput(input);
      const validationResult = validateBulkEntries(parseResult.entries);
      expect(validationResult.valid).toBe(true);

      // Should throw due to limit exceeded
      expect(() =>
        scheduleService.bulkAddEntries(
          GUILD_ID,
          USER_ID,
          USERNAME,
          validationResult.normalizedEntries,
          WEEK_ID
        )
      ).toThrow();

      // Verify no new entries were stored
      expect(scheduleService.getEntryCount(GUILD_ID, USER_ID, WEEK_ID)).toBe(18);
    });
  });

  describe('UPSERT behavior with overlapping entries', () => {
    it('should update titles for entries with matching day and start time', () => {
      // Add initial entries
      const initialInput = [
        'Monday 09:00 Original Monday Stream',
        'Wednesday 14:00 Original Wednesday Stream',
        'Friday 20:00 Original Friday Stream',
      ].join('\n');

      const parseResult1 = parseBulkInput(initialInput);
      const validationResult1 = validateBulkEntries(parseResult1.entries);
      scheduleService.bulkAddEntries(
        GUILD_ID,
        USER_ID,
        USERNAME,
        validationResult1.normalizedEntries,
        WEEK_ID
      );

      expect(scheduleService.getEntryCount(GUILD_ID, USER_ID, WEEK_ID)).toBe(3);

      // Submit overlapping entries with updated titles
      const updateInput = [
        'Monday 09:00 Updated Monday Stream',
        'Wednesday 14:00 Updated Wednesday Stream',
        'Saturday 16:00 New Saturday Stream',
      ].join('\n');

      const parseResult2 = parseBulkInput(updateInput);
      const validationResult2 = validateBulkEntries(parseResult2.entries);
      const bulkResult = scheduleService.bulkAddEntries(
        GUILD_ID,
        USER_ID,
        USERNAME,
        validationResult2.normalizedEntries,
        WEEK_ID
      );

      // 2 replaced (Monday 09:00, Wednesday 14:00) + 1 added (Saturday 16:00)
      expect(bulkResult.replaced).toBe(2);
      expect(bulkResult.added).toBe(1);

      // Total entries should be 4 (3 original - 2 replaced + 2 replaced + 1 new)
      const storedEntries = scheduleService.getEntriesForUser(GUILD_ID, USER_ID, WEEK_ID);
      expect(storedEntries).toHaveLength(4);

      // Verify titles were updated
      const monday = storedEntries.find((e) => e.day === DayOfWeek.Monday && e.startTime === '09:00');
      expect(monday!.title).toBe('Updated Monday Stream');

      const wednesday = storedEntries.find((e) => e.day === DayOfWeek.Wednesday && e.startTime === '14:00');
      expect(wednesday!.title).toBe('Updated Wednesday Stream');

      // Verify original untouched entry is still there
      const friday = storedEntries.find((e) => e.day === DayOfWeek.Friday && e.startTime === '20:00');
      expect(friday!.title).toBe('Original Friday Stream');

      // Verify new entry was added
      const saturday = storedEntries.find((e) => e.day === DayOfWeek.Saturday && e.startTime === '16:00');
      expect(saturday).toBeDefined();
      expect(saturday!.title).toBe('New Saturday Stream');
    });

    it('should not create duplicates when submitting identical entries', () => {
      const input = 'Monday 09:00 Same Stream Title';

      const parseResult = parseBulkInput(input);
      const validationResult = validateBulkEntries(parseResult.entries);

      // Add entry twice
      scheduleService.bulkAddEntries(GUILD_ID, USER_ID, USERNAME, validationResult.normalizedEntries, WEEK_ID);
      scheduleService.bulkAddEntries(GUILD_ID, USER_ID, USERNAME, validationResult.normalizedEntries, WEEK_ID);

      // Should still only be 1 entry
      expect(scheduleService.getEntryCount(GUILD_ID, USER_ID, WEEK_ID)).toBe(1);
    });
  });

  describe('Limit enforcement with existing entries + bulk submission', () => {
    it('should succeed when existing + net new does not exceed 20', () => {
      // Pre-populate 15 entries
      for (let i = 0; i < 15; i++) {
        const days = Object.values(DayOfWeek);
        const day = days[i % 7];
        const time = `${String(8 + Math.floor(i / 7)).padStart(2, '0')}:${String((i * 5) % 60).padStart(2, '0')}`;
        scheduleService.addEntry(GUILD_ID, USER_ID, USERNAME, day, time, `Pre-existing ${i + 1}`, WEEK_ID);
      }
      expect(scheduleService.getEntryCount(GUILD_ID, USER_ID, WEEK_ID)).toBe(15);

      // Submit 8 entries: 3 overlapping with existing (same day+time), 5 net new
      // Existing entries include: Monday 08:00, Tuesday 08:05, Wednesday 08:10
      // (from the loop above: i=0 → Monday 08:00, i=1 → Tuesday 08:05, i=2 → Wednesday 08:10)
      const bulkInput = [
        'Monday 08:00 Replaced Monday',        // overlaps with existing
        'Tuesday 08:05 Replaced Tuesday',       // overlaps with existing
        'Wednesday 08:10 Replaced Wednesday',   // overlaps with existing
        'Monday 22:00 New Late Monday',         // net new
        'Tuesday 22:00 New Late Tuesday',       // net new
        'Wednesday 22:00 New Late Wednesday',   // net new
        'Thursday 22:00 New Late Thursday',     // net new
        'Friday 22:00 New Late Friday',         // net new
      ].join('\n');

      const parseResult = parseBulkInput(bulkInput);
      const validationResult = validateBulkEntries(parseResult.entries);
      expect(validationResult.valid).toBe(true);

      // 15 existing + 5 net new = 20, should succeed
      const bulkResult = scheduleService.bulkAddEntries(
        GUILD_ID,
        USER_ID,
        USERNAME,
        validationResult.normalizedEntries,
        WEEK_ID
      );

      expect(bulkResult.replaced).toBe(3);
      expect(bulkResult.added).toBe(5);
      expect(scheduleService.getEntryCount(GUILD_ID, USER_ID, WEEK_ID)).toBe(20);
    });

    it('should reject when existing + net new exceeds 20', () => {
      // Pre-populate 18 entries
      for (let i = 0; i < 18; i++) {
        const days = Object.values(DayOfWeek);
        const day = days[i % 7];
        const time = `${String(8 + Math.floor(i / 7)).padStart(2, '0')}:${String((i * 5) % 60).padStart(2, '0')}`;
        scheduleService.addEntry(GUILD_ID, USER_ID, USERNAME, day, time, `Pre-existing ${i + 1}`, WEEK_ID);
      }
      expect(scheduleService.getEntryCount(GUILD_ID, USER_ID, WEEK_ID)).toBe(18);

      // Submit 5 entries all net new (18 + 5 = 23 > 20)
      const bulkInput = [
        'Monday 23:00 New Night 1',
        'Tuesday 23:00 New Night 2',
        'Wednesday 23:00 New Night 3',
        'Thursday 23:00 New Night 4',
        'Friday 23:00 New Night 5',
      ].join('\n');

      const parseResult = parseBulkInput(bulkInput);
      const validationResult = validateBulkEntries(parseResult.entries);
      expect(validationResult.valid).toBe(true);

      // Should throw — exceeds limit
      expect(() =>
        scheduleService.bulkAddEntries(
          GUILD_ID,
          USER_ID,
          USERNAME,
          validationResult.normalizedEntries,
          WEEK_ID
        )
      ).toThrow(/exceed/i);

      // Verify no new entries were stored
      expect(scheduleService.getEntryCount(GUILD_ID, USER_ID, WEEK_ID)).toBe(18);
    });

    it('should allow submission with overlapping entries that keeps total at exactly 20', () => {
      // Pre-populate exactly 20 entries
      for (let i = 0; i < 20; i++) {
        const days = Object.values(DayOfWeek);
        const day = days[i % 7];
        const time = `${String(8 + Math.floor(i / 7)).padStart(2, '0')}:${String((i * 5) % 60).padStart(2, '0')}`;
        scheduleService.addEntry(GUILD_ID, USER_ID, USERNAME, day, time, `Original ${i + 1}`, WEEK_ID);
      }
      expect(scheduleService.getEntryCount(GUILD_ID, USER_ID, WEEK_ID)).toBe(20);

      // Submit entries that ALL overlap (same day+time) — net new = 0
      const bulkInput = [
        'Monday 08:00 Updated Title 1',
        'Tuesday 08:05 Updated Title 2',
        'Wednesday 08:10 Updated Title 3',
      ].join('\n');

      const parseResult = parseBulkInput(bulkInput);
      const validationResult = validateBulkEntries(parseResult.entries);

      // Should succeed (20 + 0 net new = 20)
      const bulkResult = scheduleService.bulkAddEntries(
        GUILD_ID,
        USER_ID,
        USERNAME,
        validationResult.normalizedEntries,
        WEEK_ID
      );

      expect(bulkResult.replaced).toBe(3);
      expect(bulkResult.added).toBe(0);
      expect(scheduleService.getEntryCount(GUILD_ID, USER_ID, WEEK_ID)).toBe(20);
    });
  });
});
