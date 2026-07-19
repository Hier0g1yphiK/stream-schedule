/**
 * Handler for /schedule add, /schedule remove, and /schedule mine commands.
 *
 * These commands allow any user to manage their own schedule entries
 * for the current week.
 */

import { ChatInputCommandInteraction } from 'discord.js';
import { DayOfWeek } from '../types/index.js';
import { ConfigService } from '../services/config-service.js';
import { ScheduleService } from '../services/schedule-service.js';
import { validateTime, validateTitle } from '../utils/validators.js';
import { getCurrentWeekId } from '../utils/week-calculator.js';
import { formatEntryConfirmation } from '../utils/format-config.js';

/**
 * Resolves the current week ID for a guild based on its configuration.
 * If the guild config is incomplete (no posting day/time set), uses
 * defaults of Monday at 09:00 UTC.
 */
function resolveWeekId(configService: ConfigService, guildId: string): string {
  const config = configService.getConfig(guildId);
  const postingDay = config.postingDay ?? DayOfWeek.Monday;
  const postingTime = config.postingTime ?? '09:00';
  return getCurrentWeekId(postingDay, postingTime);
}

/**
 * Handles the /schedule add subcommand.
 *
 * Validates time and title inputs, resolves the current week,
 * adds the entry via ScheduleService, and returns a confirmation message.
 */
async function handleAdd(
  interaction: ChatInputCommandInteraction,
  configService: ConfigService,
  scheduleService: ScheduleService
): Promise<void> {
  const day = interaction.options.getString('day', true);
  const time = interaction.options.getString('time', true);
  const title = interaction.options.getString('title', true);

  // Validate time format
  const timeResult = validateTime(time);
  if (!timeResult.valid) {
    await interaction.reply({ content: `❌ ${timeResult.error}`, ephemeral: true });
    return;
  }

  // Validate title length
  const titleResult = validateTitle(title);
  if (!titleResult.valid) {
    await interaction.reply({ content: `❌ ${titleResult.error}`, ephemeral: true });
    return;
  }

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const weekId = resolveWeekId(configService, guildId);

  try {
    scheduleService.addEntry(guildId, userId, username, day as DayOfWeek, time, title, weekId);
  } catch (error: unknown) {
    // Handle the 20-entry limit error
    if (error instanceof Error && error.message.includes('Maximum')) {
      await interaction.reply({
        content: `❌ ${error.message}`,
        ephemeral: true,
      });
      return;
    }
    throw error;
  }

  const confirmation = formatEntryConfirmation(day, time, title);
  await interaction.reply({ content: confirmation, ephemeral: true });
}

/**
 * Handles the /schedule remove subcommand.
 *
 * Validates the time input, resolves the current week, and attempts
 * to remove the matching entry. Reports success or not-found.
 */
async function handleRemove(
  interaction: ChatInputCommandInteraction,
  configService: ConfigService,
  scheduleService: ScheduleService
): Promise<void> {
  const day = interaction.options.getString('day', true);
  const time = interaction.options.getString('time', true);

  // Validate time format
  const timeResult = validateTime(time);
  if (!timeResult.valid) {
    await interaction.reply({ content: `❌ ${timeResult.error}`, ephemeral: true });
    return;
  }

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const weekId = resolveWeekId(configService, guildId);

  const removed = scheduleService.removeEntry(guildId, userId, day as DayOfWeek, time, weekId);

  if (removed) {
    await interaction.reply({
      content: `✅ Removed your ${day} at ${time} UTC entry.`,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: `❌ No entry found for ${day} at ${time} UTC this week.`,
      ephemeral: true,
    });
  }
}

/**
 * Handles the /schedule mine subcommand.
 *
 * Retrieves the user's entries for the current week and displays them,
 * or shows a message if none are found.
 */
async function handleMine(
  interaction: ChatInputCommandInteraction,
  configService: ConfigService,
  scheduleService: ScheduleService
): Promise<void> {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const weekId = resolveWeekId(configService, guildId);

  const entries = scheduleService.getEntriesForUser(guildId, userId, weekId);

  if (entries.length === 0) {
    await interaction.reply({
      content: '📋 You have no schedule entries for this week.',
      ephemeral: true,
    });
    return;
  }

  const lines = entries.map(
    (entry) => `• **${entry.day}** at ${entry.startTime} UTC — ${entry.title}`
  );

  const message = `📋 **Your entries for this week (${weekId}):**\n${lines.join('\n')}`;
  await interaction.reply({ content: message, ephemeral: true });
}

/**
 * Main handler for all /schedule subcommands (add, remove, mine).
 * Routes to the appropriate subcommand handler based on the interaction.
 */
export async function handleScheduleCommand(
  interaction: ChatInputCommandInteraction,
  configService: ConfigService,
  scheduleService: ScheduleService
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'add':
      await handleAdd(interaction, configService, scheduleService);
      break;
    case 'remove':
      await handleRemove(interaction, configService, scheduleService);
      break;
    case 'mine':
      await handleMine(interaction, configService, scheduleService);
      break;
    default:
      await interaction.reply({
        content: '❌ Unknown subcommand.',
        ephemeral: true,
      });
  }
}
