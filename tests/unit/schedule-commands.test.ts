import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { ChatInputCommandInteraction } from 'discord.js';
import { handleScheduleCommand } from '../../src/commands/schedule';
import { ConfigService } from '../../src/services/config-service';
import { ScheduleService } from '../../src/services/schedule-service';
import { initializeTestDatabase } from '../../src/database/init';
import { DayOfWeek } from '../../src/types';

/**
 * Creates a mock ChatInputCommandInteraction for testing schedule commands.
 */
function createMockInteraction(overrides: {
  subcommand: string;
  guildId?: string;
  userId?: string;
  username?: string;
  options?: Record<string, string | null>;
}): ChatInputCommandInteraction {
  const options = overrides.options ?? {};

  return {
    guildId: overrides.guildId ?? 'test-guild',
    user: {
      id: overrides.userId ?? 'test-user',
      username: overrides.username ?? 'TestStreamer',
    },
    options: {
      getSubcommand: () => overrides.subcommand,
      getSubcommandGroup: () => null,
      getString: (name: string, required?: boolean) => {
        const val = options[name] ?? null;
        return val;
      },
    },
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction;
}

describe('handleScheduleCommand', () => {
  let db: Database.Database;
  let configService: ConfigService;
  let scheduleService: ScheduleService;

  beforeEach(() => {
    db = initializeTestDatabase();
    configService = new ConfigService(db);
    scheduleService = new ScheduleService(db);

    // Set up a complete guild config for week ID resolution
    configService.setChannel('test-guild', 'channel-1');
    configService.setPostingDay('test-guild', DayOfWeek.Monday);
    configService.setPostingTime('test-guild', '09:00');
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  describe('/schedule add', () => {
    it('should add an entry and return confirmation (Req 4.7)', async () => {
      const interaction = createMockInteraction({
        subcommand: 'add',
        options: {
          day: 'Wednesday',
          time: '14:00',
          title: 'Gameplay Stream',
        },
      });

      await handleScheduleCommand(interaction, configService, scheduleService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Schedule entry saved'),
        ephemeral: true,
      });
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Wednesday'),
        ephemeral: true,
      });
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('<t:'),
        ephemeral: true,
      });
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Gameplay Stream'),
        ephemeral: true,
      });
    });

    it('should reject invalid time format (Req 4.6)', async () => {
      const interaction = createMockInteraction({
        subcommand: 'add',
        options: {
          day: 'Monday',
          time: '25:00',
          title: 'Stream',
        },
      });

      await handleScheduleCommand(interaction, configService, scheduleService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Invalid time format'),
        ephemeral: true,
      });
    });

    it('should reject invalid time format - not HH:MM (Req 4.6)', async () => {
      const interaction = createMockInteraction({
        subcommand: 'add',
        options: {
          day: 'Monday',
          time: 'noon',
          title: 'Stream',
        },
      });

      await handleScheduleCommand(interaction, configService, scheduleService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Invalid time format'),
        ephemeral: true,
      });
    });

    it('should reject title exceeding 100 characters (Req 4.6)', async () => {
      const interaction = createMockInteraction({
        subcommand: 'add',
        options: {
          day: 'Monday',
          time: '14:00',
          title: 'A'.repeat(101),
        },
      });

      await handleScheduleCommand(interaction, configService, scheduleService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Invalid title'),
        ephemeral: true,
      });
    });

    it('should reject empty title (Req 4.6)', async () => {
      const interaction = createMockInteraction({
        subcommand: 'add',
        options: {
          day: 'Monday',
          time: '14:00',
          title: '',
        },
      });

      await handleScheduleCommand(interaction, configService, scheduleService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Invalid title'),
        ephemeral: true,
      });
    });

    it('should handle 20-entry limit gracefully (Req 4.3)', async () => {
      // Fill up 20 entries directly
      for (let i = 0; i < 20; i++) {
        const hour = i.toString().padStart(2, '0');
        const config = configService.getConfig('test-guild');
        const weekId = `2024-W03`; // Use a fixed week ID for this test
        scheduleService.addEntry(
          'test-guild', 'test-user', 'TestStreamer',
          DayOfWeek.Monday, `${hour}:00`, `Stream ${i}`, weekId
        );
      }

      // Patch resolveWeekId to use the same fixed weekId
      // We use the real function but need a config that produces '2024-W03'
      // Instead, add entries directly with the resolved week
      // Re-create with a fresh db to use the real weekId calculation
      db.close();
      db = initializeTestDatabase();
      configService = new ConfigService(db);
      scheduleService = new ScheduleService(db);
      configService.setChannel('test-guild', 'channel-1');
      configService.setPostingDay('test-guild', DayOfWeek.Monday);
      configService.setPostingTime('test-guild', '09:00');

      // Get the weekId that the handler would use
      const { getCurrentWeekId } = await import('../../src/utils/week-calculator');
      const weekId = getCurrentWeekId(DayOfWeek.Monday, '09:00');

      // Fill 20 entries
      for (let i = 0; i < 20; i++) {
        const hour = i.toString().padStart(2, '0');
        scheduleService.addEntry(
          'test-guild', 'test-user', 'TestStreamer',
          DayOfWeek.Monday, `${hour}:00`, `Stream ${i}`, weekId
        );
      }

      // Try adding a 21st entry via the command handler
      const interaction = createMockInteraction({
        subcommand: 'add',
        options: {
          day: 'Tuesday',
          time: '12:00',
          title: 'One Too Many',
        },
      });

      await handleScheduleCommand(interaction, configService, scheduleService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Maximum'),
        ephemeral: true,
      });
    });

    it('should work when guild config is incomplete (uses defaults)', async () => {
      // Create a guild with no config
      db.close();
      db = initializeTestDatabase();
      configService = new ConfigService(db);
      scheduleService = new ScheduleService(db);

      const interaction = createMockInteraction({
        subcommand: 'add',
        guildId: 'unconfigured-guild',
        options: {
          day: 'Friday',
          time: '18:00',
          title: 'Friday Stream',
        },
      });

      await handleScheduleCommand(interaction, configService, scheduleService);

      // Should succeed with defaults
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Schedule entry saved'),
        ephemeral: true,
      });
    });
  });

  describe('/schedule remove', () => {
    it('should remove an existing entry and confirm', async () => {
      const { getCurrentWeekId } = await import('../../src/utils/week-calculator');
      const weekId = getCurrentWeekId(DayOfWeek.Monday, '09:00');

      // Add an entry first
      scheduleService.addEntry(
        'test-guild', 'test-user', 'TestStreamer',
        DayOfWeek.Wednesday, '14:00', 'To Remove', weekId
      );

      const interaction = createMockInteraction({
        subcommand: 'remove',
        options: {
          day: 'Wednesday',
          time: '14:00',
        },
      });

      await handleScheduleCommand(interaction, configService, scheduleService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Removed'),
        ephemeral: true,
      });
    });

    it('should reply with not-found when entry does not exist', async () => {
      const interaction = createMockInteraction({
        subcommand: 'remove',
        options: {
          day: 'Thursday',
          time: '10:00',
        },
      });

      await handleScheduleCommand(interaction, configService, scheduleService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('No entry found'),
        ephemeral: true,
      });
    });

    it('should reject invalid time format', async () => {
      const interaction = createMockInteraction({
        subcommand: 'remove',
        options: {
          day: 'Monday',
          time: 'bad',
        },
      });

      await handleScheduleCommand(interaction, configService, scheduleService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Invalid time format'),
        ephemeral: true,
      });
    });
  });

  describe('/schedule mine', () => {
    it('should display user entries for the current week', async () => {
      const { getCurrentWeekId } = await import('../../src/utils/week-calculator');
      const weekId = getCurrentWeekId(DayOfWeek.Monday, '09:00');

      // Add entries
      scheduleService.addEntry(
        'test-guild', 'test-user', 'TestStreamer',
        DayOfWeek.Monday, '10:00', 'Morning Stream', weekId
      );
      scheduleService.addEntry(
        'test-guild', 'test-user', 'TestStreamer',
        DayOfWeek.Friday, '20:00', 'Friday Night', weekId
      );

      const interaction = createMockInteraction({
        subcommand: 'mine',
      });

      await handleScheduleCommand(interaction, configService, scheduleService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Morning Stream'),
        ephemeral: true,
      });
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Friday Night'),
        ephemeral: true,
      });
    });

    it('should show no entries message when user has none', async () => {
      const interaction = createMockInteraction({
        subcommand: 'mine',
      });

      await handleScheduleCommand(interaction, configService, scheduleService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('no schedule entries'),
        ephemeral: true,
      });
    });

    it('should not show entries from other users', async () => {
      const { getCurrentWeekId } = await import('../../src/utils/week-calculator');
      const weekId = getCurrentWeekId(DayOfWeek.Monday, '09:00');

      // Add entry for a different user
      scheduleService.addEntry(
        'test-guild', 'other-user', 'OtherStreamer',
        DayOfWeek.Tuesday, '12:00', 'Other Stream', weekId
      );

      const interaction = createMockInteraction({
        subcommand: 'mine',
        userId: 'test-user',
      });

      await handleScheduleCommand(interaction, configService, scheduleService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('no schedule entries'),
        ephemeral: true,
      });
    });
  });
});
