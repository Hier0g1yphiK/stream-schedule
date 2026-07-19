/**
 * Handler for /schedule setup subcommands.
 *
 * Subcommands:
 * - channel: Set the target channel for schedule posting
 * - day: Set the posting day of the week
 * - time: Set the posting time (HH:MM UTC)
 * - view: Display current configuration summary
 *
 * All subcommands require Administrator permission.
 */

import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js';
import { ConfigService } from '../services/config-service.js';
import { DayOfWeek } from '../types/index.js';
import { validateTime } from '../utils/validators.js';
import { formatConfigSummary } from '../utils/format-config.js';

/**
 * Handles all /schedule setup subcommands.
 * Enforces administrator permission before processing any subcommand.
 */
export async function handleSetupCommand(
  interaction: ChatInputCommandInteraction,
  configService: ConfigService
): Promise<void> {
  // Enforce administrator permission
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ You need Administrator permission to use setup commands.',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'channel':
      await handleSetupChannel(interaction, configService);
      break;
    case 'day':
      await handleSetupDay(interaction, configService);
      break;
    case 'time':
      await handleSetupTime(interaction, configService);
      break;
    case 'view':
      await handleSetupView(interaction, configService);
      break;
    default:
      await interaction.reply({
        content: '❌ Unknown setup subcommand.',
        ephemeral: true,
      });
  }
}

/**
 * Handles /schedule setup channel — sets the target channel for schedule posting.
 * Validates that the bot has SendMessages permission in the selected channel.
 */
async function handleSetupChannel(
  interaction: ChatInputCommandInteraction,
  configService: ConfigService
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true) as TextChannel;
  const guildId = interaction.guildId!;

  // Validate bot can send messages in the target channel
  const botMember = interaction.guild!.members.me;
  const botPermissions = channel.permissionsFor(botMember!);

  if (!botPermissions?.has(PermissionFlagsBits.SendMessages)) {
    await interaction.reply({
      content: `❌ I don't have permission to send messages in ${channel}. Please grant me the **Send Messages** permission in that channel.`,
      ephemeral: true,
    });
    return;
  }

  configService.setChannel(guildId, channel.id);

  await interaction.reply({
    content: `✅ Schedule channel set to ${channel}.`,
  });
}

/**
 * Handles /schedule setup day — sets the day of the week for posting.
 */
async function handleSetupDay(
  interaction: ChatInputCommandInteraction,
  configService: ConfigService
): Promise<void> {
  const day = interaction.options.getString('day', true) as DayOfWeek;
  const guildId = interaction.guildId!;

  configService.setPostingDay(guildId, day);

  await interaction.reply({
    content: `✅ Posting day set to **${day}**.`,
  });
}

/**
 * Handles /schedule setup time — sets the posting time (HH:MM in UTC).
 * Validates the time format before saving.
 */
async function handleSetupTime(
  interaction: ChatInputCommandInteraction,
  configService: ConfigService
): Promise<void> {
  const time = interaction.options.getString('time', true);
  const guildId = interaction.guildId!;

  const validation = validateTime(time);
  if (!validation.valid) {
    await interaction.reply({
      content: `❌ ${validation.error}`,
      ephemeral: true,
    });
    return;
  }

  configService.setPostingTime(guildId, time);

  await interaction.reply({
    content: `✅ Posting time set to **${time} UTC**.`,
  });
}

/**
 * Handles /schedule setup view — displays the current configuration summary.
 * Shows channel, posting day, and posting time, or indicates unconfigured fields.
 */
async function handleSetupView(
  interaction: ChatInputCommandInteraction,
  configService: ConfigService
): Promise<void> {
  const guildId = interaction.guildId!;
  const config = configService.getConfig(guildId);

  const channelName = config.channelId ? `<#${config.channelId}>` : '_Not set_';
  const postingDay = config.postingDay ?? '_Not set_';
  const postingTime = config.postingTime ?? '_Not set_';

  const summary = formatConfigSummary(channelName, postingDay, postingTime);

  await interaction.reply({
    content: summary,
  });
}
