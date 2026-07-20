import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostingService } from '../../src/services/posting-service';
import { ConfigService } from '../../src/services/config-service';
import { ScheduleService } from '../../src/services/schedule-service';
import { initializeTestDatabase } from '../../src/database/init';
import { DayOfWeek } from '../../src/types';
import Database from 'better-sqlite3';

/**
 * Creates a mock Discord client with controllable channel and guild behavior.
 */
function createMockClient(options: {
  channelSendSuccess?: boolean;
  channelExists?: boolean;
  guildExists?: boolean;
  ownerDmSuccess?: boolean;
} = {}) {
  const {
    channelSendSuccess = true,
    channelExists = true,
    guildExists = true,
    ownerDmSuccess = true,
  } = options;

  const sendMock = vi.fn().mockImplementation(() => {
    if (!channelSendSuccess) throw new Error('Cannot send messages');
    return Promise.resolve();
  });

  const ownerSendMock = vi.fn().mockImplementation(() => {
    if (!ownerDmSuccess) throw new Error('Cannot DM owner');
    return Promise.resolve();
  });

  const fetchOwnerMock = vi.fn().mockResolvedValue({ send: ownerSendMock });

  const mockChannel = {
    isTextBased: () => true,
    send: sendMock,
  };

  const mockGuild = {
    fetchOwner: fetchOwnerMock,
  };

  const client = {
    channels: {
      fetch: vi.fn().mockImplementation(() => {
        if (!channelExists) return Promise.resolve(null);
        return Promise.resolve(mockChannel);
      }),
    },
    guilds: {
      cache: {
        get: vi.fn().mockImplementation(() => guildExists ? mockGuild : undefined),
      },
      fetch: vi.fn().mockImplementation(() => {
        if (!guildExists) throw new Error('Guild not found');
        return Promise.resolve(mockGuild);
      }),
    },
  } as any;

  return { client, sendMock, ownerSendMock, fetchOwnerMock };
}

describe('PostingService', () => {
  let db: Database.Database;
  let configService: ConfigService;
  let scheduleService: ScheduleService;

  beforeEach(() => {
    db = initializeTestDatabase();
    configService = new ConfigService(db);
    scheduleService = new ScheduleService(db);
  });

  describe('checkAndPost()', () => {
    it('should post schedule when it is posting time and config is complete', async () => {
      const { client, sendMock } = createMockClient();
      const postingService = new PostingService(client, db, configService, scheduleService);

      // Set up a guild with complete config — posting time = now
      const now = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = dayNames[now.getUTCDay()] as DayOfWeek;
      const currentTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;

      configService.setChannel('guild-1', 'channel-1');
      configService.setPostingDay('guild-1', currentDay);
      configService.setPostingTime('guild-1', currentTime);

      await postingService.checkAndPost();

      expect(sendMock).toHaveBeenCalled();
    });

    it('should not post when it is not posting time', async () => {
      const { client, sendMock } = createMockClient();
      const postingService = new PostingService(client, db, configService, scheduleService);

      // Set up a guild with posting time far in the future (different day)
      const now = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      // Pick a day that is NOT today
      const futureDayIndex = (now.getUTCDay() + 3) % 7;
      const futureDay = dayNames[futureDayIndex] as DayOfWeek;

      configService.setChannel('guild-1', 'channel-1');
      configService.setPostingDay('guild-1', futureDay);
      configService.setPostingTime('guild-1', '12:00');

      await postingService.checkAndPost();

      expect(sendMock).not.toHaveBeenCalled();
    });

    it('should skip guilds with incomplete config and DM admin if posting time matches', async () => {
      const { client, sendMock, ownerSendMock } = createMockClient();
      const postingService = new PostingService(client, db, configService, scheduleService);

      // Set up guild with partial config (no channel) but posting day/time matching now
      const now = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = dayNames[now.getUTCDay()] as DayOfWeek;
      const currentTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;

      configService.setPostingDay('guild-1', currentDay);
      configService.setPostingTime('guild-1', currentTime);

      await postingService.checkAndPost();

      // Should NOT attempt to post to channel
      expect(sendMock).not.toHaveBeenCalled();
      // Should DM admin about incomplete setup
      expect(ownerSendMock).toHaveBeenCalledWith(expect.stringContaining('incomplete'));
    });

    it('should not double-post in the same week', async () => {
      const { client, sendMock } = createMockClient();
      const postingService = new PostingService(client, db, configService, scheduleService);

      const now = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = dayNames[now.getUTCDay()] as DayOfWeek;
      const currentTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;

      configService.setChannel('guild-1', 'channel-1');
      configService.setPostingDay('guild-1', currentDay);
      configService.setPostingTime('guild-1', currentTime);

      // Post first time
      await postingService.checkAndPost();
      expect(sendMock).toHaveBeenCalledTimes(1);

      // Post second time — should be prevented by last_posted_week
      await postingService.checkAndPost();
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('should clear week entries after successful post', async () => {
      const { client } = createMockClient();
      const postingService = new PostingService(client, db, configService, scheduleService);

      const now = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = dayNames[now.getUTCDay()] as DayOfWeek;
      const currentTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;

      configService.setChannel('guild-1', 'channel-1');
      configService.setPostingDay('guild-1', currentDay);
      configService.setPostingTime('guild-1', currentTime);

      // Add an entry for the current week
      const { getCurrentWeekId } = await import('../../src/utils/week-calculator');
      const weekId = getCurrentWeekId(currentDay, currentTime);
      scheduleService.addEntry('guild-1', 'user-1', 'Streamer', DayOfWeek.Monday, '10:00', 'Test Stream', weekId);

      // Verify entry exists
      expect(scheduleService.getEntriesForWeek('guild-1', weekId)).toHaveLength(1);

      await postingService.checkAndPost();

      // After posting, entries should be cleared
      expect(scheduleService.getEntriesForWeek('guild-1', weekId)).toHaveLength(0);
    });
  });

  describe('postSchedule()', () => {
    it('should return true on successful post', async () => {
      const { client } = createMockClient();
      const postingService = new PostingService(client, db, configService, scheduleService);

      configService.setChannel('guild-1', 'channel-1');
      configService.setPostingDay('guild-1', DayOfWeek.Monday);
      configService.setPostingTime('guild-1', '10:00');

      const result = await postingService.postSchedule('guild-1');
      expect(result).toBe(true);
    });

    it('should return false when config is incomplete', async () => {
      const { client } = createMockClient();
      const postingService = new PostingService(client, db, configService, scheduleService);

      // No config set for this guild
      const result = await postingService.postSchedule('guild-1');
      expect(result).toBe(false);
    });

    it('should retry once after first failure then DM admin on second failure', async () => {
      const { client, sendMock, ownerSendMock } = createMockClient({ channelSendSuccess: false });
      const postingService = new PostingService(client, db, configService, scheduleService);

      // Override delay to avoid waiting in tests
      (postingService as any).delay = vi.fn().mockResolvedValue(undefined);

      configService.setChannel('guild-1', 'channel-1');
      configService.setPostingDay('guild-1', DayOfWeek.Monday);
      configService.setPostingTime('guild-1', '10:00');

      const result = await postingService.postSchedule('guild-1');

      // Should have attempted twice (initial + retry)
      expect(sendMock).toHaveBeenCalledTimes(2);
      // Should have waited 1 minute between attempts
      expect((postingService as any).delay).toHaveBeenCalledWith(60_000);
      // Should DM admin about failure
      expect(ownerSendMock).toHaveBeenCalledWith(expect.stringContaining('Failed to post'));
      // Should return false
      expect(result).toBe(false);
    });

    it('should succeed on retry after first attempt fails', async () => {
      const { client, sendMock } = createMockClient();
      const postingService = new PostingService(client, db, configService, scheduleService);

      // Override delay to avoid waiting in tests
      (postingService as any).delay = vi.fn().mockResolvedValue(undefined);

      // First call fails, second succeeds
      sendMock
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(undefined);

      configService.setChannel('guild-1', 'channel-1');
      configService.setPostingDay('guild-1', DayOfWeek.Monday);
      configService.setPostingTime('guild-1', '10:00');

      const result = await postingService.postSchedule('guild-1');

      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(result).toBe(true);
    });

    it('should return false when channel does not exist', async () => {
      const { client } = createMockClient({ channelExists: false });
      const postingService = new PostingService(client, db, configService, scheduleService);

      // Override delay to avoid waiting in tests
      (postingService as any).delay = vi.fn().mockResolvedValue(undefined);

      configService.setChannel('guild-1', 'nonexistent-channel');
      configService.setPostingDay('guild-1', DayOfWeek.Monday);
      configService.setPostingTime('guild-1', '10:00');

      const result = await postingService.postSchedule('guild-1');
      expect(result).toBe(false);
    });

    it('should format schedule with entries when posting', async () => {
      const { client, sendMock } = createMockClient();
      const postingService = new PostingService(client, db, configService, scheduleService);

      configService.setChannel('guild-1', 'channel-1');
      configService.setPostingDay('guild-1', DayOfWeek.Monday);
      configService.setPostingTime('guild-1', '10:00');

      // Add entries
      const { getCurrentWeekId } = await import('../../src/utils/week-calculator');
      const weekId = getCurrentWeekId(DayOfWeek.Monday, '10:00');
      scheduleService.addEntry('guild-1', 'user-1', 'Alice', DayOfWeek.Wednesday, '14:00', 'Art Stream', weekId);

      await postingService.postSchedule('guild-1');

      expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('Alice'));
      expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('Art Stream'));
      expect(sendMock).toHaveBeenCalledWith(expect.stringMatching(/<t:\d+:t>/));
    });

    it('should post "no streams scheduled" when no entries exist', async () => {
      const { client, sendMock } = createMockClient();
      const postingService = new PostingService(client, db, configService, scheduleService);

      configService.setChannel('guild-1', 'channel-1');
      configService.setPostingDay('guild-1', DayOfWeek.Monday);
      configService.setPostingTime('guild-1', '10:00');

      await postingService.postSchedule('guild-1');

      expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('No streams scheduled this week'));
    });
  });
});
