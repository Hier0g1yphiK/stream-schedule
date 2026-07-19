import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { handleSetupCommand } from '../../src/commands/setup.js';
import { ConfigService } from '../../src/services/config-service.js';
import { initializeTestDatabase } from '../../src/database/init.js';
import Database from 'better-sqlite3';

/**
 * Integration tests for the /schedule setup command flow.
 * Uses a real in-memory SQLite database to verify end-to-end behavior.
 *
 * Validates: Requirements 1.1, 1.3, 1.4, 1.5
 */

const GUILD_ID = 'guild-001';
const CHANNEL_ID = 'channel-999';

/**
 * Creates a mock Discord interaction with admin permissions by default.
 */
function createMockInteraction(options: {
  isAdmin?: boolean;
  subcommand?: string;
  channelId?: string;
  botCanSend?: boolean;
  day?: string;
  time?: string;
} = {}) {
  const {
    isAdmin = true,
    subcommand = 'channel',
    channelId = CHANNEL_ID,
    botCanSend = true,
    day = 'Monday',
    time = '14:00',
  } = options;

  const mockChannel = {
    id: channelId,
    toString: () => `<#${channelId}>`,
    permissionsFor: vi.fn().mockReturnValue({
      has: vi.fn().mockReturnValue(botCanSend),
    }),
  };

  return {
    guildId: GUILD_ID,
    memberPermissions: isAdmin
      ? { has: vi.fn().mockReturnValue(true) }
      : { has: vi.fn().mockReturnValue(false) },
    guild: {
      members: {
        me: { id: 'bot-member-id' },
      },
    },
    options: {
      getSubcommand: vi.fn().mockReturnValue(subcommand),
      getChannel: vi.fn().mockReturnValue(mockChannel),
      getString: vi.fn((name: string) => {
        if (name === 'day') return day;
        if (name === 'time') return time;
        return null;
      }),
    },
    reply: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('Setup Flow Integration', () => {
  let db: Database.Database;
  let configService: ConfigService;

  beforeEach(() => {
    db = initializeTestDatabase();
    configService = new ConfigService(db);
  });

  describe('Complete setup flow (Req 1.1)', () => {
    it('sets channel → day → time → view shows all values', async () => {
      // Step 1: Set channel
      const channelInteraction = createMockInteraction({
        subcommand: 'channel',
        channelId: 'ch-123',
        botCanSend: true,
      });
      await handleSetupCommand(channelInteraction, configService);
      expect(channelInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Schedule channel set to'),
      });

      // Step 2: Set day
      const dayInteraction = createMockInteraction({
        subcommand: 'day',
        day: 'Friday',
      });
      await handleSetupCommand(dayInteraction, configService);
      expect(dayInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Friday'),
      });

      // Step 3: Set time
      const timeInteraction = createMockInteraction({
        subcommand: 'time',
        time: '18:00',
      });
      await handleSetupCommand(timeInteraction, configService);
      expect(timeInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('18:00 UTC'),
      });

      // Step 4: View shows all saved values
      const viewInteraction = createMockInteraction({ subcommand: 'view' });
      await handleSetupCommand(viewInteraction, configService);

      const viewReply = viewInteraction.reply.mock.calls[0][0].content as string;
      expect(viewReply).toContain('Current Configuration');
      expect(viewReply).toContain('<#ch-123>');
      expect(viewReply).toContain('Friday');
      expect(viewReply).toContain('18:00');
    });
  });

  describe('Permission checks (Req 1.4, 1.5)', () => {
    it('rejects non-admin user with appropriate error message', async () => {
      const interaction = createMockInteraction({
        isAdmin: false,
        subcommand: 'channel',
      });

      await handleSetupCommand(interaction, configService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Administrator permission'),
        ephemeral: true,
      });

      // Verify nothing was persisted
      const config = configService.getConfig(GUILD_ID);
      expect(config.channelId).toBeNull();
    });

    it('rejects non-admin for day subcommand', async () => {
      const interaction = createMockInteraction({
        isAdmin: false,
        subcommand: 'day',
      });

      await handleSetupCommand(interaction, configService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Administrator permission'),
        ephemeral: true,
      });
    });

    it('rejects non-admin for time subcommand', async () => {
      const interaction = createMockInteraction({
        isAdmin: false,
        subcommand: 'time',
      });

      await handleSetupCommand(interaction, configService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Administrator permission'),
        ephemeral: true,
      });
    });

    it('rejects non-admin for view subcommand', async () => {
      const interaction = createMockInteraction({
        isAdmin: false,
        subcommand: 'view',
      });

      await handleSetupCommand(interaction, configService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Administrator permission'),
        ephemeral: true,
      });
    });

    it('admin user can successfully set each field (Req 1.1)', async () => {
      // Set channel
      const chInteraction = createMockInteraction({ subcommand: 'channel', channelId: 'ch-abc' });
      await handleSetupCommand(chInteraction, configService);
      expect(configService.getConfig(GUILD_ID).channelId).toBe('ch-abc');

      // Set day
      const dayInteraction = createMockInteraction({ subcommand: 'day', day: 'Tuesday' });
      await handleSetupCommand(dayInteraction, configService);
      expect(configService.getConfig(GUILD_ID).postingDay).toBe('Tuesday');

      // Set time
      const timeInteraction = createMockInteraction({ subcommand: 'time', time: '09:30' });
      await handleSetupCommand(timeInteraction, configService);
      expect(configService.getConfig(GUILD_ID).postingTime).toBe('09:30');
    });
  });

  describe('Channel permission validation (Req 1.3)', () => {
    it('rejects channel where bot lacks send permissions', async () => {
      const interaction = createMockInteraction({
        subcommand: 'channel',
        channelId: 'restricted-channel',
        botCanSend: false,
      });

      await handleSetupCommand(interaction, configService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("don't have permission"),
        ephemeral: true,
      });

      // Verify nothing was persisted
      const config = configService.getConfig(GUILD_ID);
      expect(config.channelId).toBeNull();
    });

    it('accepts channel where bot has send permissions', async () => {
      const interaction = createMockInteraction({
        subcommand: 'channel',
        channelId: 'allowed-channel',
        botCanSend: true,
      });

      await handleSetupCommand(interaction, configService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Schedule channel set to'),
      });

      const config = configService.getConfig(GUILD_ID);
      expect(config.channelId).toBe('allowed-channel');
    });
  });

  describe('Modifying one setting preserves others', () => {
    it('changing day preserves channel and time', async () => {
      // Set all three fields
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'channel', channelId: 'ch-keep' }),
        configService
      );
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'day', day: 'Monday' }),
        configService
      );
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'time', time: '10:00' }),
        configService
      );

      // Change only the day
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'day', day: 'Saturday' }),
        configService
      );

      const config = configService.getConfig(GUILD_ID);
      expect(config.channelId).toBe('ch-keep');
      expect(config.postingDay).toBe('Saturday');
      expect(config.postingTime).toBe('10:00');
    });

    it('changing time preserves channel and day', async () => {
      // Set all three fields
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'channel', channelId: 'ch-persist' }),
        configService
      );
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'day', day: 'Wednesday' }),
        configService
      );
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'time', time: '08:00' }),
        configService
      );

      // Change only the time
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'time', time: '22:30' }),
        configService
      );

      const config = configService.getConfig(GUILD_ID);
      expect(config.channelId).toBe('ch-persist');
      expect(config.postingDay).toBe('Wednesday');
      expect(config.postingTime).toBe('22:30');
    });

    it('changing channel preserves day and time', async () => {
      // Set all three fields
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'channel', channelId: 'ch-old' }),
        configService
      );
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'day', day: 'Sunday' }),
        configService
      );
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'time', time: '15:45' }),
        configService
      );

      // Change only the channel
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'channel', channelId: 'ch-new' }),
        configService
      );

      const config = configService.getConfig(GUILD_ID);
      expect(config.channelId).toBe('ch-new');
      expect(config.postingDay).toBe('Sunday');
      expect(config.postingTime).toBe('15:45');
    });
  });

  describe('View command shows complete configuration', () => {
    it('shows all configured values after full setup', async () => {
      // Complete setup
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'channel', channelId: 'ch-view-test' }),
        configService
      );
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'day', day: 'Thursday' }),
        configService
      );
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'time', time: '20:00' }),
        configService
      );

      // View
      const viewInteraction = createMockInteraction({ subcommand: 'view' });
      await handleSetupCommand(viewInteraction, configService);

      const reply = viewInteraction.reply.mock.calls[0][0].content as string;
      expect(reply).toContain('Current Configuration');
      expect(reply).toContain('<#ch-view-test>');
      expect(reply).toContain('Thursday');
      expect(reply).toContain('20:00');
    });

    it('shows "Not set" for unconfigured fields', async () => {
      const viewInteraction = createMockInteraction({ subcommand: 'view' });
      await handleSetupCommand(viewInteraction, configService);

      const reply = viewInteraction.reply.mock.calls[0][0].content as string;
      expect(reply).toContain('Not set');
    });

    it('shows partial configuration correctly', async () => {
      // Only set channel
      await handleSetupCommand(
        createMockInteraction({ subcommand: 'channel', channelId: 'ch-partial' }),
        configService
      );

      const viewInteraction = createMockInteraction({ subcommand: 'view' });
      await handleSetupCommand(viewInteraction, configService);

      const reply = viewInteraction.reply.mock.calls[0][0].content as string;
      expect(reply).toContain('<#ch-partial>');
      expect(reply).toContain('Not set');
    });
  });
});
