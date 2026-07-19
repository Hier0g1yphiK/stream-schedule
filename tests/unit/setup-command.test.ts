import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSetupCommand } from '../../src/commands/setup.js';
import { PermissionFlagsBits } from 'discord.js';
import { DayOfWeek } from '../../src/types/index.js';

// Helper to create a mock interaction
function createMockInteraction(overrides: Record<string, unknown> = {}) {
  return {
    guildId: '123456789',
    memberPermissions: {
      has: vi.fn().mockReturnValue(true),
    },
    guild: {
      members: {
        me: { id: 'bot-id' },
      },
    },
    options: {
      getSubcommand: vi.fn().mockReturnValue('channel'),
      getChannel: vi.fn(),
      getString: vi.fn(),
    },
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

function createMockConfigService() {
  return {
    getConfig: vi.fn().mockReturnValue({
      guildId: '123456789',
      channelId: null,
      postingDay: null,
      postingTime: null,
    }),
    setChannel: vi.fn(),
    setPostingDay: vi.fn(),
    setPostingTime: vi.fn(),
    isComplete: vi.fn().mockReturnValue(false),
  } as any;
}

describe('handleSetupCommand', () => {
  let interaction: ReturnType<typeof createMockInteraction>;
  let configService: ReturnType<typeof createMockConfigService>;

  beforeEach(() => {
    interaction = createMockInteraction();
    configService = createMockConfigService();
  });

  describe('permission check', () => {
    it('rejects non-administrator users with ephemeral message', async () => {
      interaction.memberPermissions.has.mockReturnValue(false);

      await handleSetupCommand(interaction, configService);

      expect(interaction.memberPermissions.has).toHaveBeenCalledWith(
        PermissionFlagsBits.Administrator
      );
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Administrator permission'),
        ephemeral: true,
      });
    });

    it('rejects when memberPermissions is null', async () => {
      interaction.memberPermissions = null;

      await handleSetupCommand(interaction, configService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Administrator permission'),
        ephemeral: true,
      });
    });
  });

  describe('setup channel', () => {
    it('sets channel when bot has send permissions', async () => {
      interaction.options.getSubcommand.mockReturnValue('channel');
      const mockChannel = {
        id: '987654321',
        toString: () => '<#987654321>',
        permissionsFor: vi.fn().mockReturnValue({
          has: vi.fn().mockReturnValue(true),
        }),
      };
      interaction.options.getChannel.mockReturnValue(mockChannel);

      await handleSetupCommand(interaction, configService);

      expect(configService.setChannel).toHaveBeenCalledWith('123456789', '987654321');
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Schedule channel set to'),
      });
    });

    it('rejects channel when bot lacks send permissions', async () => {
      interaction.options.getSubcommand.mockReturnValue('channel');
      const mockChannel = {
        id: '987654321',
        toString: () => '<#987654321>',
        permissionsFor: vi.fn().mockReturnValue({
          has: vi.fn().mockReturnValue(false),
        }),
      };
      interaction.options.getChannel.mockReturnValue(mockChannel);

      await handleSetupCommand(interaction, configService);

      expect(configService.setChannel).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("don't have permission"),
        ephemeral: true,
      });
    });
  });

  describe('setup day', () => {
    it('sets posting day with valid day choice', async () => {
      interaction.options.getSubcommand.mockReturnValue('day');
      interaction.options.getString.mockReturnValue('Wednesday');

      await handleSetupCommand(interaction, configService);

      expect(configService.setPostingDay).toHaveBeenCalledWith(
        '123456789',
        'Wednesday'
      );
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Wednesday'),
      });
    });
  });

  describe('setup time', () => {
    it('sets posting time with valid HH:MM format', async () => {
      interaction.options.getSubcommand.mockReturnValue('time');
      interaction.options.getString.mockReturnValue('14:30');

      await handleSetupCommand(interaction, configService);

      expect(configService.setPostingTime).toHaveBeenCalledWith('123456789', '14:30');
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('14:30 UTC'),
      });
    });

    it('rejects invalid time format with ephemeral error', async () => {
      interaction.options.getSubcommand.mockReturnValue('time');
      interaction.options.getString.mockReturnValue('25:00');

      await handleSetupCommand(interaction, configService);

      expect(configService.setPostingTime).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Invalid time format'),
        ephemeral: true,
      });
    });

    it('rejects non-HH:MM time strings', async () => {
      interaction.options.getSubcommand.mockReturnValue('time');
      interaction.options.getString.mockReturnValue('2pm');

      await handleSetupCommand(interaction, configService);

      expect(configService.setPostingTime).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Invalid time format'),
        ephemeral: true,
      });
    });
  });

  describe('setup view', () => {
    it('displays current config when all fields are set', async () => {
      interaction.options.getSubcommand.mockReturnValue('view');
      configService.getConfig.mockReturnValue({
        guildId: '123456789',
        channelId: '111222333',
        postingDay: DayOfWeek.Monday,
        postingTime: '09:00',
      });

      await handleSetupCommand(interaction, configService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Current Configuration'),
      });
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('<#111222333>'),
      });
    });

    it('displays "Not set" for unconfigured fields', async () => {
      interaction.options.getSubcommand.mockReturnValue('view');
      configService.getConfig.mockReturnValue({
        guildId: '123456789',
        channelId: null,
        postingDay: null,
        postingTime: null,
      });

      await handleSetupCommand(interaction, configService);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Not set'),
      });
    });
  });
});
