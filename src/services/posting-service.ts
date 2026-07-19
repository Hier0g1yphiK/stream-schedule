import { Client, TextChannel, Guild } from 'discord.js';
import Database from 'better-sqlite3';
import { DayOfWeek, ScheduleEntry } from '../types';
import { ConfigService } from './config-service';
import { ScheduleService } from './schedule-service';
import { isPostingTime, getCurrentWeekId } from '../utils/week-calculator';

/**
 * Order of days for schedule display (Monday–Sunday).
 */
const DAY_ORDER: DayOfWeek[] = [
  DayOfWeek.Monday,
  DayOfWeek.Tuesday,
  DayOfWeek.Wednesday,
  DayOfWeek.Thursday,
  DayOfWeek.Friday,
  DayOfWeek.Saturday,
  DayOfWeek.Sunday,
];

/**
 * Formats a list of schedule entries into a Discord-ready message.
 *
 * Groups entries by day (Monday–Sunday order), sorts by start time within
 * each day, and displays streamer name, time, and title.
 *
 * Returns a "no streams scheduled" message when entries is empty.
 *
 * Requirements: 5.2, 5.3
 */
export function formatSchedule(entries: ScheduleEntry[]): string {
  if (entries.length === 0) {
    return '📅 **Weekly Stream Schedule**\n\nNo streams scheduled this week.';
  }

  // Group entries by day
  const grouped = new Map<DayOfWeek, ScheduleEntry[]>();
  for (const entry of entries) {
    const existing = grouped.get(entry.day) || [];
    existing.push(entry);
    grouped.set(entry.day, existing);
  }

  // Build formatted output
  const lines: string[] = ['📅 **Weekly Stream Schedule**'];

  for (const day of DAY_ORDER) {
    const dayEntries = grouped.get(day);
    if (!dayEntries || dayEntries.length === 0) {
      continue;
    }

    // Sort by start time ascending
    dayEntries.sort((a, b) => a.startTime.localeCompare(b.startTime));

    lines.push('');
    lines.push(`**${day}**`);
    for (const entry of dayEntries) {
      lines.push(`• ${entry.startTime} — ${entry.username} — ${entry.title}`);
    }
  }

  return lines.join('\n');
}

/**
 * Row shape for guild_config when querying all guilds.
 */
interface GuildConfigRow {
  guild_id: string;
  channel_id: string | null;
  posting_day: string | null;
  posting_time: string | null;
  last_posted_week: string | null;
}

/**
 * Service responsible for checking posting schedules and posting the weekly
 * schedule to configured Discord channels.
 *
 * Handles retry logic (one retry after 1 minute) and DM notifications to
 * server admins on failure or incomplete configuration.
 *
 * Requirements: 5.1, 5.4, 5.5, 5.6
 */
export class PostingService {
  private client: Client;
  private db: Database.Database;
  private configService: ConfigService;
  private scheduleService: ScheduleService;

  constructor(
    client: Client,
    db: Database.Database,
    configService: ConfigService,
    scheduleService: ScheduleService
  ) {
    this.client = client;
    this.db = db;
    this.configService = configService;
    this.scheduleService = scheduleService;
  }

  /**
   * Called every minute by the scheduler. Queries all guild configs,
   * checks if it's posting time for each, and attempts to post.
   *
   * Uses `last_posted_week` to prevent double-posting in the same week.
   *
   * Requirements: 5.1, 5.6
   */
  async checkAndPost(): Promise<void> {
    const rows = this.db
      .prepare('SELECT guild_id, channel_id, posting_day, posting_time, last_posted_week FROM guild_config')
      .all() as GuildConfigRow[];

    for (const row of rows) {
      try {
        await this.processGuild(row);
      } catch (error) {
        // Log and continue to next guild — one guild's error shouldn't block others
        console.error(`[PostingService] Error processing guild ${row.guild_id}:`, error);
      }
    }
  }

  /**
   * Processes a single guild: checks config completeness, posting time,
   * and double-post prevention before attempting to post.
   */
  private async processGuild(row: GuildConfigRow): Promise<void> {
    const { guild_id: guildId, channel_id: channelId, posting_day: postingDay, posting_time: postingTime, last_posted_week: lastPostedWeek } = row;

    // Check if config is complete
    if (!channelId || !postingDay || !postingTime) {
      // Incomplete config — check if it's posting time to DM admin
      if (postingDay && postingTime && isPostingTime(postingDay as DayOfWeek, postingTime)) {
        await this.dmAdmin(guildId, '⚠️ Your stream schedule bot setup is incomplete. Please complete the setup by configuring the channel, posting day, and posting time using `/schedule setup`.');
      }
      return;
    }

    // Check if it's posting time
    if (!isPostingTime(postingDay as DayOfWeek, postingTime)) {
      return;
    }

    // Prevent double-posting: check if we already posted for this week
    const currentWeekId = getCurrentWeekId(postingDay as DayOfWeek, postingTime);
    if (lastPostedWeek === currentWeekId) {
      return;
    }

    // Attempt to post
    const success = await this.postSchedule(guildId);
    if (success) {
      // Mark this week as posted
      this.db
        .prepare('UPDATE guild_config SET last_posted_week = ? WHERE guild_id = ?')
        .run(currentWeekId, guildId);

      // Clear week entries after successful post
      this.scheduleService.clearWeek(guildId, currentWeekId);
    }
  }

  /**
   * Attempts to post the formatted schedule to the guild's target channel.
   * On failure, waits 1 minute and retries once. If the retry also fails,
   * DMs the admin.
   *
   * Requirements: 5.1, 5.4, 5.5
   */
  async postSchedule(guildId: string): Promise<boolean> {
    const config = this.configService.getConfig(guildId);

    if (!config.channelId || !config.postingDay || !config.postingTime) {
      return false;
    }

    const weekId = getCurrentWeekId(config.postingDay, config.postingTime);
    const entries = this.scheduleService.getEntriesForWeek(guildId, weekId);
    const message = formatSchedule(entries);

    // First attempt
    const firstAttempt = await this.attemptPost(config.channelId, message);
    if (firstAttempt) {
      return true;
    }

    // Wait 1 minute before retry
    await this.delay(60_000);

    // Retry
    const secondAttempt = await this.attemptPost(config.channelId, message);
    if (secondAttempt) {
      return true;
    }

    // Both attempts failed — DM admin
    await this.dmAdmin(
      guildId,
      '❌ Failed to post the weekly stream schedule. The target channel may be unavailable or the bot may lack send permissions. Please check the channel configuration using `/schedule setup view`.'
    );

    return false;
  }

  /**
   * Attempts to send a message to the specified channel.
   * Returns true on success, false on any failure.
   */
  private async attemptPost(channelId: string, message: string): Promise<boolean> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        return false;
      }
      await (channel as TextChannel).send(message);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sends a DM to the guild owner (admin) with the provided message.
   * Silently fails if DMs are disabled — notification is best-effort.
   */
  private async dmAdmin(guildId: string, message: string): Promise<void> {
    try {
      const guild: Guild | undefined = this.client.guilds.cache.get(guildId) ?? await this.client.guilds.fetch(guildId);
      if (!guild) {
        return;
      }
      const owner = await guild.fetchOwner();
      await owner.send(message);
    } catch {
      // DMs may be disabled — best-effort notification
      console.warn(`[PostingService] Could not DM admin for guild ${guildId}`);
    }
  }

  /**
   * Delay utility for retry logic.
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
