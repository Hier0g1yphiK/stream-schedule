import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ScheduleService } from '../../src/services/schedule-service';
import { initializeTestDatabase } from '../../src/database/init';
import { DayOfWeek } from '../../src/types';

describe('ScheduleService', () => {
  let db: Database.Database;
  let service: ScheduleService;

  beforeEach(() => {
    db = initializeTestDatabase();
    service = new ScheduleService(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  describe('addEntry', () => {
    it('should insert a new entry and return it with an id', () => {
      const entry = service.addEntry(
        'guild-1', 'user-1', 'StreamerA', DayOfWeek.Monday, '14:00', 'Gameplay Stream', '2024-W03'
      );

      expect(entry.id).toBeGreaterThan(0);
      expect(entry.guildId).toBe('guild-1');
      expect(entry.userId).toBe('user-1');
      expect(entry.username).toBe('StreamerA');
      expect(entry.day).toBe(DayOfWeek.Monday);
      expect(entry.startTime).toBe('14:00');
      expect(entry.title).toBe('Gameplay Stream');
      expect(entry.weekId).toBe('2024-W03');
    });

    it('should upsert — replacing title on same day+time+week (Req 4.4)', () => {
      service.addEntry(
        'guild-1', 'user-1', 'StreamerA', DayOfWeek.Tuesday, '20:00', 'Original Title', '2024-W03'
      );
      const updated = service.addEntry(
        'guild-1', 'user-1', 'StreamerA', DayOfWeek.Tuesday, '20:00', 'Updated Title', '2024-W03'
      );

      expect(updated.title).toBe('Updated Title');

      // Should still be only 1 entry
      const count = service.getEntryCount('guild-1', 'user-1', '2024-W03');
      expect(count).toBe(1);
    });

    it('should update username on upsert', () => {
      service.addEntry(
        'guild-1', 'user-1', 'OldName', DayOfWeek.Monday, '10:00', 'Stream', '2024-W03'
      );
      const updated = service.addEntry(
        'guild-1', 'user-1', 'NewName', DayOfWeek.Monday, '10:00', 'Stream', '2024-W03'
      );

      expect(updated.username).toBe('NewName');
    });

    it('should allow multiple entries for the same user with different times', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'Morning', '2024-W03');
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '20:00', 'Evening', '2024-W03');

      const count = service.getEntryCount('guild-1', 'user-1', '2024-W03');
      expect(count).toBe(2);
    });

    it('should enforce maximum of 20 entries per streamer per week (Req 4.3)', () => {
      // Add 20 entries
      for (let i = 0; i < 20; i++) {
        const hour = i.toString().padStart(2, '0');
        service.addEntry(
          'guild-1', 'user-1', 'Streamer', DayOfWeek.Monday, `${hour}:00`, `Stream ${i}`, '2024-W03'
        );
      }

      // 21st entry should throw
      expect(() =>
        service.addEntry(
          'guild-1', 'user-1', 'Streamer', DayOfWeek.Tuesday, '12:00', 'Too many', '2024-W03'
        )
      ).toThrow(/Maximum of 20 entries/);
    });

    it('should allow upsert even when at 20 entries', () => {
      // Add 20 entries
      for (let i = 0; i < 20; i++) {
        const hour = i.toString().padStart(2, '0');
        service.addEntry(
          'guild-1', 'user-1', 'Streamer', DayOfWeek.Monday, `${hour}:00`, `Stream ${i}`, '2024-W03'
        );
      }

      // Updating an existing entry should succeed
      const updated = service.addEntry(
        'guild-1', 'user-1', 'Streamer', DayOfWeek.Monday, '05:00', 'Updated Stream 5', '2024-W03'
      );

      expect(updated.title).toBe('Updated Stream 5');
      expect(service.getEntryCount('guild-1', 'user-1', '2024-W03')).toBe(20);
    });

    it('should keep entries isolated between guilds', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'G1', '2024-W03');
      service.addEntry('guild-2', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'G2', '2024-W03');

      expect(service.getEntryCount('guild-1', 'user-1', '2024-W03')).toBe(1);
      expect(service.getEntryCount('guild-2', 'user-1', '2024-W03')).toBe(1);
    });

    it('should keep entries isolated between weeks', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'W3', '2024-W03');
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'W4', '2024-W04');

      expect(service.getEntryCount('guild-1', 'user-1', '2024-W03')).toBe(1);
      expect(service.getEntryCount('guild-1', 'user-1', '2024-W04')).toBe(1);
    });
  });

  describe('removeEntry', () => {
    it('should delete a matching entry and return true', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Wednesday, '15:00', 'Stream', '2024-W03');

      const removed = service.removeEntry('guild-1', 'user-1', DayOfWeek.Wednesday, '15:00', '2024-W03');
      expect(removed).toBe(true);

      const count = service.getEntryCount('guild-1', 'user-1', '2024-W03');
      expect(count).toBe(0);
    });

    it('should return false when no matching entry exists', () => {
      const removed = service.removeEntry('guild-1', 'user-1', DayOfWeek.Monday, '10:00', '2024-W03');
      expect(removed).toBe(false);
    });

    it('should only remove the specific entry, not others for the same user', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'Keep', '2024-W03');
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Tuesday, '14:00', 'Remove', '2024-W03');

      service.removeEntry('guild-1', 'user-1', DayOfWeek.Tuesday, '14:00', '2024-W03');

      const entries = service.getEntriesForUser('guild-1', 'user-1', '2024-W03');
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('Keep');
    });
  });

  describe('getEntriesForWeek', () => {
    it('should return empty array when no entries exist', () => {
      const entries = service.getEntriesForWeek('guild-1', '2024-W03');
      expect(entries).toEqual([]);
    });

    it('should return all entries for the specified guild and week', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'S1', '2024-W03');
      service.addEntry('guild-1', 'user-2', 'B', DayOfWeek.Tuesday, '14:00', 'S2', '2024-W03');
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Friday, '20:00', 'S3', '2024-W03');

      const entries = service.getEntriesForWeek('guild-1', '2024-W03');
      expect(entries).toHaveLength(3);
    });

    it('should not include entries from other weeks', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'W3', '2024-W03');
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'W4', '2024-W04');

      const entries = service.getEntriesForWeek('guild-1', '2024-W03');
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('W3');
    });

    it('should not include entries from other guilds', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'G1', '2024-W03');
      service.addEntry('guild-2', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'G2', '2024-W03');

      const entries = service.getEntriesForWeek('guild-1', '2024-W03');
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('G1');
    });
  });

  describe('getEntriesForUser', () => {
    it('should return only entries for the specified user', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'U1', '2024-W03');
      service.addEntry('guild-1', 'user-2', 'B', DayOfWeek.Monday, '12:00', 'U2', '2024-W03');

      const entries = service.getEntriesForUser('guild-1', 'user-1', '2024-W03');
      expect(entries).toHaveLength(1);
      expect(entries[0].userId).toBe('user-1');
      expect(entries[0].title).toBe('U1');
    });

    it('should return empty array when user has no entries', () => {
      const entries = service.getEntriesForUser('guild-1', 'user-1', '2024-W03');
      expect(entries).toEqual([]);
    });
  });

  describe('getEntryCount', () => {
    it('should return 0 when no entries exist', () => {
      expect(service.getEntryCount('guild-1', 'user-1', '2024-W03')).toBe(0);
    });

    it('should return correct count after adding entries', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'S1', '2024-W03');
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Tuesday, '14:00', 'S2', '2024-W03');

      expect(service.getEntryCount('guild-1', 'user-1', '2024-W03')).toBe(2);
    });

    it('should not count entries from other users', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'S1', '2024-W03');
      service.addEntry('guild-1', 'user-2', 'B', DayOfWeek.Monday, '10:00', 'S2', '2024-W03');

      expect(service.getEntryCount('guild-1', 'user-1', '2024-W03')).toBe(1);
    });
  });

  describe('clearWeek (Req 5.4)', () => {
    it('should delete all entries for the specified guild and week', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'S1', '2024-W03');
      service.addEntry('guild-1', 'user-2', 'B', DayOfWeek.Tuesday, '14:00', 'S2', '2024-W03');

      service.clearWeek('guild-1', '2024-W03');

      const entries = service.getEntriesForWeek('guild-1', '2024-W03');
      expect(entries).toEqual([]);
    });

    it('should not affect entries from other weeks', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'W3', '2024-W03');
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'W4', '2024-W04');

      service.clearWeek('guild-1', '2024-W03');

      expect(service.getEntriesForWeek('guild-1', '2024-W03')).toEqual([]);
      expect(service.getEntriesForWeek('guild-1', '2024-W04')).toHaveLength(1);
    });

    it('should not affect entries from other guilds', () => {
      service.addEntry('guild-1', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'G1', '2024-W03');
      service.addEntry('guild-2', 'user-1', 'A', DayOfWeek.Monday, '10:00', 'G2', '2024-W03');

      service.clearWeek('guild-1', '2024-W03');

      expect(service.getEntriesForWeek('guild-1', '2024-W03')).toEqual([]);
      expect(service.getEntriesForWeek('guild-2', '2024-W03')).toHaveLength(1);
    });

    it('should be safe to call when no entries exist', () => {
      // Should not throw
      service.clearWeek('guild-1', '2024-W03');
      expect(service.getEntriesForWeek('guild-1', '2024-W03')).toEqual([]);
    });
  });
});
