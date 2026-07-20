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
import { formatDiscordTimestamp } from '../utils/discord-time.js';
import { parseBulkInput } from '../utils/bulk-parser.js';
import { validateBulkEntries } from '../utils/bulk-validator.js';
import {
  formatBulkConfirmation,
  formatBulkErrors,
  formatNoEntriesError,
  formatLimitExceededError,
} from '../utils/bulk-response.js';

/**
 * Resolves the week ID for a guild based on configuration and optional user choice.
 *
 * When weekChoice is explicitly set:
 * - 'this' = the current ISO calendar week (the week you're physically in)
 * - 'next' = the next ISO calendar week
 *
 * When weekChoice is null/undefined (auto-detect):
 * - Uses the posting-boundary logic: before posting time = current cycle,
 *   after posting time = next cycle.
 */
function resolveWeekId(configService: ConfigService, guildId: string, weekChoice?: string | null): string {
  const config = configService.getConfig(guildId);
  const postingDay = config.postingDay ?? DayOfWeek.Monday;
  const postingTime = config.postingTime ?? '09:00';

  if (weekChoice === 'this') {
    // User explicitly chose "This week" — use the current ISO calendar week
    return getISOWeekIdForDate(new Date());
  }
  if (weekChoice === 'next') {
    // User explicitly chose "Next week" — use next ISO calendar week
    const nextMonday = new Date();
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
    return getISOWeekIdForDate(nextMonday);
  }
  // Auto-detect based on posting schedule
  return getCurrentWeekId(postingDay, postingTime);
}

/**
 * Returns the ISO week ID (YYYY-Www) for a given date.
 */
function getISOWeekIdForDate(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
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
  const weekChoice = interaction.options.getString('week');
  const weekId = resolveWeekId(configService, guildId, weekChoice);

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

  const confirmation = formatEntryConfirmation(day, time, title, weekId);
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
    (entry) => `• **${entry.day}** at ${formatDiscordTimestamp(entry.day, entry.startTime, weekId)} — ${entry.title}`
  );

  const message = `📋 **Your entries for this week (${weekId}):**\n${lines.join('\n')}`;
  await interaction.reply({ content: message, ephemeral: true });
}

/**
 * Handles the /schedule bulk subcommand.
 *
 * Pipeline: parse → validate → pre-check → store → respond.
 * Error precedence: no entries → parse errors → count > 20 → validation errors → net new limit → storage failure.
 */
async function handleBulk(
  interaction: ChatInputCommandInteraction,
  configService: ConfigService,
  scheduleService: ScheduleService
): Promise<void> {
  const entries = interaction.options.getString('entries', true);

  // Step 1: Parse the bulk input
  const parseResult = parseBulkInput(entries);

  // Step 2: No entries and no errors means all blank/whitespace input
  if (parseResult.entries.length === 0 && parseResult.errors.length === 0) {
    await interaction.reply({ content: formatNoEntriesError(), ephemeral: true });
    return;
  }

  // Step 3: Parse errors take precedence
  if (parseResult.errors.length > 0) {
    await interaction.reply({ content: formatBulkErrors(parseResult.errors, []), ephemeral: true });
    return;
  }

  // Step 4: Validate entries (includes count > 20 check)
  const validationResult = validateBulkEntries(parseResult.entries);

  if (!validationResult.valid) {
    await interaction.reply({ content: formatBulkErrors([], validationResult.errors), ephemeral: true });
    return;
  }

  // Step 5: Resolve the week ID using guild config and optional user choice
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const weekChoice = interaction.options.getString('week');
  const weekId = resolveWeekId(configService, guildId, weekChoice);

  // Step 6: Store entries atomically
  try {
    const result = scheduleService.bulkAddEntries(guildId, userId, username, validationResult.normalizedEntries, weekId);
    await interaction.reply({ content: formatBulkConfirmation(result.entries, weekId), ephemeral: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('exceed')) {
      // Net new limit exceeded — parse the counts from the error message
      const existingCount = scheduleService.getEntryCount(guildId, userId, weekId);
      const netNew = validationResult.normalizedEntries.length - countReplacements(scheduleService, guildId, userId, validationResult.normalizedEntries, weekId);
      await interaction.reply({
        content: formatLimitExceededError(existingCount, netNew, 20),
        ephemeral: true,
      });
      return;
    }
    // Generic storage failure
    await interaction.reply({
      content: '❌ Failed to save entries. Please try again.',
      ephemeral: true,
    });
  }
}

/**
 * Counts how many of the submitted entries would replace existing entries
 * (same day and start time for the same user/guild/week).
 */
function countReplacements(
  scheduleService: ScheduleService,
  guildId: string,
  userId: string,
  entries: { day: DayOfWeek; startTime: string }[],
  weekId: string
): number {
  const existingEntries = scheduleService.getEntriesForUser(guildId, userId, weekId);
  let replacements = 0;
  for (const entry of entries) {
    const match = existingEntries.find(
      (e) => e.day === entry.day && e.startTime === entry.startTime
    );
    if (match) {
      replacements++;
    }
  }
  return replacements;
}

/**
 * Main handler for all /schedule subcommands (add, remove, mine, bulk).
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
    case 'bulk':
      await handleBulk(interaction, configService, scheduleService);
      break;
    default:
      await interaction.reply({
        content: '❌ Unknown subcommand.',
        ephemeral: true,
      });
  }
}
