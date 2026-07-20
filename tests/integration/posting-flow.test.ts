import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { PostingService, formatSchedule } from '../../src/services/posting-service';
import { ConfigService } from '../../src/services/config-service';
import { ScheduleService } from '../../src/services/schedule-service';
import { initializeTestDatabase } from '../../src/database/init';
import { DayOfWeek } from '../../src/types';
import { getCurrentWeekId } from '../../src/utils/week-calculator';

/**
 * Integration tests for the schedule posting flow.
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 *
 * Uses a real SQLite in-memory database with mocked Discord client/channel objects.
 */

/**
 * Creates a mock Discord client with configurable channel send behavior.
 */
function createMockClient(options: {
  sendBehavior?: 'success' | 'fail' | 'fail-once';
} = {}) {
  const { sendBehavior = 'success' } = options;

  const sendMock = vi.fn();
  const ownerSendMock = vi.fn().mockResolvedValue(undefined);
  const fetchOwnerMock = vi.fn().mockResolvedValue({ send: ownerSendMock });

  if (sendBehavior === 'success') {
    sendMock.mockResolvedValue(undefined);
  } else if (sendBehavior === 'fail') {
    sendMock.mockRejectedValue(new Error('Channel unavailable'));
  } else if (sendBehavior === 'fail-once') {
    sendMock
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce(undefined);
  }

  const mockChannel = {
    isTextBased: () => true,
    send: sendMock,
  };

  const mockGuild = {
    fetchOwner: fetchOwnerMock,
  };

  const client = {
    channels: {
      fetch: vi.fn().mockResolvedValue(mockChannel),
    },
    guilds: {
      cache: {
        get: vi.fn().mockReturnValue(mockGuild),
      },
      fetch: vi.fn().mockResolvedValue(mockGuild),
    },
  } as any;

  return { client, sendMock, ownerSendMock, fetchOwnerMock, mockChannel };
}

describe('Integration: Schedule Posting Flow', () => {
  let db: Database.Database;
  let configService: ConfigService;
  let scheduleService: ScheduleService;

  const GUILD_ID = 'guild-integration-1';
  const CHANNEL_ID = 'channel-integration-1';
  const POSTING_DAY = DayOfWeek.Monday;
  const POSTING_TIME = '10:00';

  beforeEach(() => {
    db = initializeTestDatabase();
    configService = new ConfigService(db);
    scheduleService = new ScheduleService(db);
  });

  /**
   * Helper: sets up a complete guild config for posting.
   */
  function setupGuildConfig(guildId = GUILD_ID, channelId = CHANNEL_ID, day = POSTING_DAY, time = POSTING_TIME) {
    configService.setChannel(guildId, channelId);
    configService.setPostingDay(guildId, day);
    configService.setPostingTime(guildId, time);
  }

  /**
   * Helper: creates a PostingService with the delay method overridden to be instant.
   */
  function createPostingService(client: any) {
    const service = new PostingService(client, db, configService, scheduleService);
    // Override delay to avoid waiting in tests
    (service as any).delay = vi.fn().mockResolvedValue(undefined);
    return service;
  }

  describe('Full flow: add entries → post → entries cleared', () => {
    it('should post formatted schedule and clear entries after successful post', async () => {
      const { client, sendMock } = createMockClient();
      const postingService = createPostingService(client);

      // Step 1: Set up guild config
      setupGuildConfig();

      // Step 2: Add schedule entries
      const weekId = getCurrentWeekId(POSTING_DAY, POSTING_TIME);
      scheduleService.addEntry(GUILD_ID, 'user-1', 'Alice', DayOfWeek.Wednesday, '14:00', 'Art Stream', weekId);
      scheduleService.addEntry(GUILD_ID, 'user-2', 'Bob', DayOfWeek.Friday, '20:00', 'Gaming Night', weekId);

      // Verify entries exist before posting
      const entriesBefore = scheduleService.getEntriesForWeek(GUILD_ID, weekId);
      expect(entriesBefore).toHaveLength(2);

      // Step 3: Post the schedule
      const result = await postingService.postSchedule(GUILD_ID);

      // Step 4: Verify correct format was sent
      expect(result).toBe(true);
      expect(sendMock).toHaveBeenCalledTimes(1);
      const sentMessage = sendMock.mock.calls[0][0] as string;
      expect(sentMessage).toContain('📅 **Weekly Stream Schedule**');
      expect(sentMessage).toContain('**Wednesday**');
      expect(sentMessage).toMatch(/<t:\d+:t> — Alice — Art Stream/);
      expect(sentMessage).toContain('**Friday**');
      expect(sentMessage).toMatch(/<t:\d+:t> — Bob — Gaming Night/);
    });

    it('should clear entries after posting via checkAndPost', async () => {
      const { client, sendMock } = createMockClient();
      const postingService = createPostingService(client);

      // Set posting time to now for checkAndPost to trigger
      const now = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = dayNames[now.getUTCDay()] as DayOfWeek;
      const currentTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;

      setupGuildConfig(GUILD_ID, CHANNEL_ID, currentDay, currentTime);

      const weekId = getCurrentWeekId(currentDay, currentTime);
      scheduleService.addEntry(GUILD_ID, 'user-1', 'Alice', DayOfWeek.Monday, '09:00', 'Morning Stream', weekId);

      // Verify entry exists
      expect(scheduleService.getEntriesForWeek(GUILD_ID, weekId)).toHaveLength(1);

      // Trigger checkAndPost
      await postingService.checkAndPost();

      // Verify post was sent
      expect(sendMock).toHaveBeenCalledTimes(1);

      // Verify entries are cleared after posting
      expect(scheduleService.getEntriesForWeek(GUILD_ID, weekId)).toHaveLength(0);
    });
  });

  describe('Empty schedule posting', () => {
    it('should post "no streams scheduled" message when no entries exist', async () => {
      const { client, sendMock } = createMockClient();
      const postingService = createPostingService(client);

      // Set up config but add no entries
      setupGuildConfig();

      const result = await postingService.postSchedule(GUILD_ID);

      expect(result).toBe(true);
      expect(sendMock).toHaveBeenCalledTimes(1);
      const sentMessage = sendMock.mock.calls[0][0] as string;
      expect(sentMessage).toContain('No streams scheduled this week');
    });
  });

  describe('Retry logic with simulated failures', () => {
    it('should retry once and succeed after initial failure', async () => {
      const { client, sendMock } = createMockClient({ sendBehavior: 'fail-once' });
      const postingService = createPostingService(client);

      setupGuildConfig();

      const result = await postingService.postSchedule(GUILD_ID);

      // Should have tried twice: first fails, second succeeds
      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(result).toBe(true);
      // Should have called delay between attempts
      expect((postingService as any).delay).toHaveBeenCalledWith(60_000);
    });

    it('should DM admin when both retry attempts fail', async () => {
      const { client, sendMock, ownerSendMock } = createMockClient({ sendBehavior: 'fail' });
      const postingService = createPostingService(client);

      setupGuildConfig();

      const result = await postingService.postSchedule(GUILD_ID);

      // Both attempts should have been made
      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(result).toBe(false);
      // Admin should be notified via DM
      expect(ownerSendMock).toHaveBeenCalledTimes(1);
      expect(ownerSendMock).toHaveBeenCalledWith(
        expect.stringContaining('Failed to post the weekly stream schedule')
      );
    });
  });

  describe('Schedule grouping by day and sorting by time', () => {
    it('should group entries by day in Monday-Sunday order and sort by time within each day', async () => {
      const { client, sendMock } = createMockClient();
      const postingService = createPostingService(client);

      setupGuildConfig();

      const weekId = getCurrentWeekId(POSTING_DAY, POSTING_TIME);

      // Add entries out of order across multiple days
      scheduleService.addEntry(GUILD_ID, 'user-1', 'Alice', DayOfWeek.Friday, '20:00', 'Friday Night Stream', weekId);
      scheduleService.addEntry(GUILD_ID, 'user-2', 'Bob', DayOfWeek.Monday, '15:00', 'Afternoon Session', weekId);
      scheduleService.addEntry(GUILD_ID, 'user-3', 'Charlie', DayOfWeek.Monday, '09:00', 'Morning Session', weekId);
      scheduleService.addEntry(GUILD_ID, 'user-4', 'Diana', DayOfWeek.Wednesday, '12:00', 'Lunch Stream', weekId);
      scheduleService.addEntry(GUILD_ID, 'user-5', 'Eve', DayOfWeek.Friday, '14:00', 'Afternoon Fun', weekId);

      await postingService.postSchedule(GUILD_ID);

      const sentMessage = sendMock.mock.calls[0][0] as string;

      // Verify day ordering: Monday before Wednesday before Friday
      const mondayIndex = sentMessage.indexOf('**Monday**');
      const wednesdayIndex = sentMessage.indexOf('**Wednesday**');
      const fridayIndex = sentMessage.indexOf('**Friday**');
      expect(mondayIndex).toBeLessThan(wednesdayIndex);
      expect(wednesdayIndex).toBeLessThan(fridayIndex);

      // Verify time sorting within Monday: Morning before Afternoon
      const morningIndex = sentMessage.indexOf('Charlie — Morning Session');
      const afternoonIndex = sentMessage.indexOf('Bob — Afternoon Session');
      expect(morningIndex).toBeLessThan(afternoonIndex);

      // Verify time sorting within Friday: Afternoon before Night
      const fridayAfternoonIndex = sentMessage.indexOf('Eve — Afternoon Fun');
      const fridayNightIndex = sentMessage.indexOf('Alice — Friday Night Stream');
      expect(fridayAfternoonIndex).toBeLessThan(fridayNightIndex);
    });
  });

  describe('Double-post prevention', () => {
    it('should not post a second time when checkAndPost is called again in the same week', async () => {
      const { client, sendMock } = createMockClient();
      const postingService = createPostingService(client);

      // Set posting time to now so checkAndPost triggers
      const now = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = dayNames[now.getUTCDay()] as DayOfWeek;
      const currentTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;

      setupGuildConfig(GUILD_ID, CHANNEL_ID, currentDay, currentTime);

      // First call should post
      await postingService.checkAndPost();
      expect(sendMock).toHaveBeenCalledTimes(1);

      // Second call should NOT post (double-post prevention via last_posted_week)
      await postingService.checkAndPost();
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });
});
