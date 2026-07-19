import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ConfigService } from '../../src/services/config-service';
import { initializeTestDatabase } from '../../src/database/init';
import { DayOfWeek } from '../../src/types';

describe('ConfigService', () => {
  let db: Database.Database;
  let service: ConfigService;

  beforeEach(() => {
    db = initializeTestDatabase();
    service = new ConfigService(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  describe('getConfig', () => {
    it('should return defaults when no config exists for a guild', () => {
      const config = service.getConfig('guild-123');
      expect(config).toEqual({
        guildId: 'guild-123',
        channelId: null,
        postingDay: null,
        postingTime: null,
      });
    });

    it('should return stored configuration', () => {
      db.prepare(
        'INSERT INTO guild_config (guild_id, channel_id, posting_day, posting_time) VALUES (?, ?, ?, ?)'
      ).run('guild-123', 'channel-456', 'Monday', '09:00');

      const config = service.getConfig('guild-123');
      expect(config).toEqual({
        guildId: 'guild-123',
        channelId: 'channel-456',
        postingDay: DayOfWeek.Monday,
        postingTime: '09:00',
      });
    });

    it('should return partial config when only some fields are set', () => {
      db.prepare('INSERT INTO guild_config (guild_id, channel_id) VALUES (?, ?)').run(
        'guild-123',
        'channel-456'
      );

      const config = service.getConfig('guild-123');
      expect(config.channelId).toBe('channel-456');
      expect(config.postingDay).toBeNull();
      expect(config.postingTime).toBeNull();
    });
  });

  describe('setChannel', () => {
    it('should insert channel when no config exists', () => {
      service.setChannel('guild-123', 'channel-456');

      const config = service.getConfig('guild-123');
      expect(config.channelId).toBe('channel-456');
    });

    it('should update channel when config already exists', () => {
      service.setChannel('guild-123', 'channel-old');
      service.setChannel('guild-123', 'channel-new');

      const config = service.getConfig('guild-123');
      expect(config.channelId).toBe('channel-new');
    });

    it('should not overwrite other fields when updating channel', () => {
      service.setPostingDay('guild-123', DayOfWeek.Friday);
      service.setPostingTime('guild-123', '14:00');
      service.setChannel('guild-123', 'channel-456');

      const config = service.getConfig('guild-123');
      expect(config.channelId).toBe('channel-456');
      expect(config.postingDay).toBe(DayOfWeek.Friday);
      expect(config.postingTime).toBe('14:00');
    });
  });

  describe('setPostingDay', () => {
    it('should insert posting day when no config exists', () => {
      service.setPostingDay('guild-123', DayOfWeek.Wednesday);

      const config = service.getConfig('guild-123');
      expect(config.postingDay).toBe(DayOfWeek.Wednesday);
    });

    it('should update posting day when config already exists', () => {
      service.setPostingDay('guild-123', DayOfWeek.Monday);
      service.setPostingDay('guild-123', DayOfWeek.Saturday);

      const config = service.getConfig('guild-123');
      expect(config.postingDay).toBe(DayOfWeek.Saturday);
    });

    it('should not overwrite other fields when updating day', () => {
      service.setChannel('guild-123', 'channel-456');
      service.setPostingTime('guild-123', '10:00');
      service.setPostingDay('guild-123', DayOfWeek.Tuesday);

      const config = service.getConfig('guild-123');
      expect(config.channelId).toBe('channel-456');
      expect(config.postingDay).toBe(DayOfWeek.Tuesday);
      expect(config.postingTime).toBe('10:00');
    });
  });

  describe('setPostingTime', () => {
    it('should insert posting time when no config exists', () => {
      service.setPostingTime('guild-123', '18:30');

      const config = service.getConfig('guild-123');
      expect(config.postingTime).toBe('18:30');
    });

    it('should update posting time when config already exists', () => {
      service.setPostingTime('guild-123', '08:00');
      service.setPostingTime('guild-123', '20:00');

      const config = service.getConfig('guild-123');
      expect(config.postingTime).toBe('20:00');
    });

    it('should not overwrite other fields when updating time', () => {
      service.setChannel('guild-123', 'channel-456');
      service.setPostingDay('guild-123', DayOfWeek.Sunday);
      service.setPostingTime('guild-123', '12:00');

      const config = service.getConfig('guild-123');
      expect(config.channelId).toBe('channel-456');
      expect(config.postingDay).toBe(DayOfWeek.Sunday);
      expect(config.postingTime).toBe('12:00');
    });
  });

  describe('isComplete', () => {
    it('should return false when no config exists', () => {
      expect(service.isComplete('guild-123')).toBe(false);
    });

    it('should return false when only channel is set', () => {
      service.setChannel('guild-123', 'channel-456');
      expect(service.isComplete('guild-123')).toBe(false);
    });

    it('should return false when only day and time are set', () => {
      service.setPostingDay('guild-123', DayOfWeek.Monday);
      service.setPostingTime('guild-123', '09:00');
      expect(service.isComplete('guild-123')).toBe(false);
    });

    it('should return true when all three fields are set', () => {
      service.setChannel('guild-123', 'channel-456');
      service.setPostingDay('guild-123', DayOfWeek.Monday);
      service.setPostingTime('guild-123', '09:00');
      expect(service.isComplete('guild-123')).toBe(true);
    });
  });

  describe('multi-guild isolation', () => {
    it('should keep configs separate between guilds', () => {
      service.setChannel('guild-1', 'channel-a');
      service.setPostingDay('guild-1', DayOfWeek.Monday);

      service.setChannel('guild-2', 'channel-b');
      service.setPostingDay('guild-2', DayOfWeek.Friday);

      const config1 = service.getConfig('guild-1');
      const config2 = service.getConfig('guild-2');

      expect(config1.channelId).toBe('channel-a');
      expect(config1.postingDay).toBe(DayOfWeek.Monday);

      expect(config2.channelId).toBe('channel-b');
      expect(config2.postingDay).toBe(DayOfWeek.Friday);
    });
  });
});
