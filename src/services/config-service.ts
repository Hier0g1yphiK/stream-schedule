import Database from 'better-sqlite3';
import { DayOfWeek, SetupConfiguration } from '../types';

/**
 * Service for managing guild bot configuration (channel, posting day, posting time).
 * Uses SQLite with upsert pattern for persistence.
 */
export class ConfigService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Returns the stored configuration for a guild, or defaults (nulls) if none exists.
   */
  getConfig(guildId: string): SetupConfiguration {
    const row = this.db
      .prepare('SELECT guild_id, channel_id, posting_day, posting_time FROM guild_config WHERE guild_id = ?')
      .get(guildId) as { guild_id: string; channel_id: string | null; posting_day: string | null; posting_time: string | null } | undefined;

    if (!row) {
      return {
        guildId,
        channelId: null,
        postingDay: null,
        postingTime: null,
      };
    }

    return {
      guildId: row.guild_id,
      channelId: row.channel_id,
      postingDay: row.posting_day as DayOfWeek | null,
      postingTime: row.posting_time,
    };
  }

  /**
   * Sets (upserts) the target channel for schedule posting in a guild.
   */
  setChannel(guildId: string, channelId: string): void {
    this.db
      .prepare(
        `INSERT INTO guild_config (guild_id, channel_id)
         VALUES (?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id`
      )
      .run(guildId, channelId);
  }

  /**
   * Sets (upserts) the posting day for a guild's weekly schedule.
   */
  setPostingDay(guildId: string, day: DayOfWeek): void {
    this.db
      .prepare(
        `INSERT INTO guild_config (guild_id, posting_day)
         VALUES (?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET posting_day = excluded.posting_day`
      )
      .run(guildId, day);
  }

  /**
   * Sets (upserts) the posting time (HH:MM UTC) for a guild's weekly schedule.
   */
  setPostingTime(guildId: string, time: string): void {
    this.db
      .prepare(
        `INSERT INTO guild_config (guild_id, posting_time)
         VALUES (?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET posting_time = excluded.posting_time`
      )
      .run(guildId, time);
  }

  /**
   * Returns true when all three configuration fields (channel, day, time) are set.
   */
  isComplete(guildId: string): boolean {
    const config = this.getConfig(guildId);
    return config.channelId !== null && config.postingDay !== null && config.postingTime !== null;
  }
}
