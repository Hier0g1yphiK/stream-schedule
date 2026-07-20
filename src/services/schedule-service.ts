import Database from 'better-sqlite3';
import { DayOfWeek, ScheduleEntry } from '../types/index.js';
import { NormalizedEntry } from '../utils/bulk-validator.js';

const MAX_ENTRIES_PER_STREAMER_PER_WEEK = 20;

/**
 * Result of a bulk add operation, containing counts and the resulting entries.
 */
export interface BulkAddResult {
  added: number;
  replaced: number;
  entries: ScheduleEntry[];
}

/**
 * Row shape returned by SQLite queries on the schedule_entries table.
 */
interface ScheduleEntryRow {
  id: number;
  guild_id: string;
  user_id: string;
  username: string;
  day: string;
  start_time: string;
  title: string;
  week_id: string;
}

/**
 * Maps a raw database row to a typed ScheduleEntry.
 */
function rowToEntry(row: ScheduleEntryRow): ScheduleEntry {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    username: row.username,
    day: row.day as DayOfWeek,
    startTime: row.start_time,
    title: row.title,
    weekId: row.week_id,
  };
}

/**
 * Service for managing streamer schedule entries.
 * Provides CRUD operations backed by SQLite with UPSERT semantics.
 */
export class ScheduleService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Adds or replaces a schedule entry for a streamer.
   * Uses INSERT ... ON CONFLICT ... DO UPDATE to handle the UPSERT.
   * Enforces a maximum of 20 entries per streamer per week.
   *
   * @throws Error if the streamer already has 20 entries for the week
   *         and this would be a new (non-replacement) entry.
   */
  addEntry(
    guildId: string,
    userId: string,
    username: string,
    day: DayOfWeek,
    startTime: string,
    title: string,
    weekId: string
  ): ScheduleEntry {
    // Check if this would be a new entry (not replacing an existing one)
    const existing = this.db
      .prepare(
        `SELECT id FROM schedule_entries
         WHERE guild_id = ? AND user_id = ? AND day = ? AND start_time = ? AND week_id = ?`
      )
      .get(guildId, userId, day, startTime, weekId) as { id: number } | undefined;

    if (!existing) {
      // This is a new entry — enforce the 20-entry limit
      const count = this.getEntryCount(guildId, userId, weekId);
      if (count >= MAX_ENTRIES_PER_STREAMER_PER_WEEK) {
        throw new Error(
          `Maximum of ${MAX_ENTRIES_PER_STREAMER_PER_WEEK} entries per streamer per week reached.`
        );
      }
    }

    // UPSERT: insert or replace title/username on conflict
    this.db
      .prepare(
        `INSERT INTO schedule_entries (guild_id, user_id, username, day, start_time, title, week_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id, day, start_time, week_id)
         DO UPDATE SET title = excluded.title, username = excluded.username`
      )
      .run(guildId, userId, username, day, startTime, title, weekId);

    // Retrieve the full entry (including generated id)
    const row = this.db
      .prepare(
        `SELECT id, guild_id, user_id, username, day, start_time, title, week_id
         FROM schedule_entries
         WHERE guild_id = ? AND user_id = ? AND day = ? AND start_time = ? AND week_id = ?`
      )
      .get(guildId, userId, day, startTime, weekId) as ScheduleEntryRow;

    return rowToEntry(row);
  }

  /**
   * Removes a specific schedule entry for the given user, day, start time, and week.
   * Returns true if an entry was deleted, false if no matching entry existed.
   */
  removeEntry(guildId: string, userId: string, day: DayOfWeek, startTime: string, weekId: string): boolean {
    const result = this.db
      .prepare(
        `DELETE FROM schedule_entries
         WHERE guild_id = ? AND user_id = ? AND day = ? AND start_time = ? AND week_id = ?`
      )
      .run(guildId, userId, day, startTime, weekId);

    return result.changes > 0;
  }

  /**
   * Returns all schedule entries for a guild in a given week.
   */
  getEntriesForWeek(guildId: string, weekId: string): ScheduleEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, guild_id, user_id, username, day, start_time, title, week_id
         FROM schedule_entries
         WHERE guild_id = ? AND week_id = ?
         ORDER BY day, start_time`
      )
      .all(guildId, weekId) as ScheduleEntryRow[];

    return rows.map(rowToEntry);
  }

  /**
   * Returns all schedule entries for a specific user in a given week.
   */
  getEntriesForUser(guildId: string, userId: string, weekId: string): ScheduleEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, guild_id, user_id, username, day, start_time, title, week_id
         FROM schedule_entries
         WHERE guild_id = ? AND user_id = ? AND week_id = ?
         ORDER BY day, start_time`
      )
      .all(guildId, userId, weekId) as ScheduleEntryRow[];

    return rows.map(rowToEntry);
  }

  /**
   * Returns the number of entries a user has for a given week in a guild.
   */
  getEntryCount(guildId: string, userId: string, weekId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM schedule_entries
         WHERE guild_id = ? AND user_id = ? AND week_id = ?`
      )
      .get(guildId, userId, weekId) as { count: number };

    return row.count;
  }

  /**
   * Deletes all schedule entries for a given week in a guild.
   * Used after successfully posting the weekly schedule.
   */
  clearWeek(guildId: string, weekId: string): void {
    this.db
      .prepare('DELETE FROM schedule_entries WHERE guild_id = ? AND week_id = ?')
      .run(guildId, weekId);
  }

  /**
   * Stores all entries in a single transaction with UPSERT semantics.
   * Pre-checks net new count against the 20-entry limit.
   *
   * @throws Error if net new entries would exceed the 20-entry weekly limit
   * @throws Error if any entry fails to store (full rollback via transaction)
   */
  bulkAddEntries(
    guildId: string,
    userId: string,
    username: string,
    entries: NormalizedEntry[],
    weekId: string
  ): BulkAddResult {
    // Pre-check: calculate net new count
    const existingCount = this.getEntryCount(guildId, userId, weekId);

    // Count how many submitted entries match an existing entry (replacements)
    const checkExisting = this.db.prepare(
      `SELECT id FROM schedule_entries
       WHERE guild_id = ? AND user_id = ? AND day = ? AND start_time = ? AND week_id = ?`
    );

    let replacements = 0;
    for (const entry of entries) {
      const existing = checkExisting.get(guildId, userId, entry.day, entry.startTime, weekId) as
        | { id: number }
        | undefined;
      if (existing) {
        replacements++;
      }
    }

    const netNew = entries.length - replacements;
    if (existingCount + netNew > MAX_ENTRIES_PER_STREAMER_PER_WEEK) {
      throw new Error(
        `Adding ${netNew} new entries would exceed the maximum of ${MAX_ENTRIES_PER_STREAMER_PER_WEEK} entries per streamer per week. You currently have ${existingCount} entries.`
      );
    }

    // Execute all inserts/upserts in a single transaction
    const upsertStmt = this.db.prepare(
      `INSERT INTO schedule_entries (guild_id, user_id, username, day, start_time, title, week_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(guild_id, user_id, day, start_time, week_id)
       DO UPDATE SET title = excluded.title, username = excluded.username`
    );

    const selectStmt = this.db.prepare(
      `SELECT id, guild_id, user_id, username, day, start_time, title, week_id
       FROM schedule_entries
       WHERE guild_id = ? AND user_id = ? AND day = ? AND start_time = ? AND week_id = ?`
    );

    let added = 0;
    let replaced = 0;
    const resultEntries: ScheduleEntry[] = [];

    const transaction = this.db.transaction(() => {
      for (const entry of entries) {
        // Check if this is a replacement or new entry
        const existing = checkExisting.get(guildId, userId, entry.day, entry.startTime, weekId) as
          | { id: number }
          | undefined;

        if (existing) {
          replaced++;
        } else {
          added++;
        }

        // UPSERT the entry
        upsertStmt.run(guildId, userId, username, entry.day, entry.startTime, entry.title, weekId);

        // Retrieve the resulting entry
        const row = selectStmt.get(
          guildId,
          userId,
          entry.day,
          entry.startTime,
          weekId
        ) as ScheduleEntryRow;
        resultEntries.push(rowToEntry(row));
      }
    });

    transaction();

    return { added, replaced, entries: resultEntries };
  }
}
