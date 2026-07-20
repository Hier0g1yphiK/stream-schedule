/**
 * Command registry and loader for the Discord Stream Schedule Bot.
 *
 * Defines the /schedule command group with subcommands:
 * - setup channel | day | time | view (Administrator only)
 * - add (Everyone)
 * - remove (Everyone)
 * - mine (Everyone)
 */

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { DAY_CHOICES } from '../types/commands.js';

/**
 * Builds the /schedule slash command with all subcommands and options.
 */
function buildScheduleCommand(): SlashCommandBuilder {
  const command = new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Manage the weekly stream schedule');

  // Setup subcommand group — Administrator only
  command.addSubcommandGroup((group) =>
    group
      .setName('setup')
      .setDescription('Configure the stream schedule bot (Admin only)')
      .addSubcommand((sub) =>
        sub
          .setName('channel')
          .setDescription('Set the channel where the schedule will be posted')
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('The text channel for schedule posts')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('day')
          .setDescription('Set the day of the week to post the schedule')
          .addStringOption((option) => {
            option
              .setName('day')
              .setDescription('Day of the week')
              .setRequired(true);
            for (const choice of DAY_CHOICES) {
              option.addChoices({ name: choice.name, value: choice.value });
            }
            return option;
          })
      )
      .addSubcommand((sub) =>
        sub
          .setName('time')
          .setDescription('Set the time of day to post the schedule (UTC, HH:MM)')
          .addStringOption((option) =>
            option
              .setName('time')
              .setDescription('Posting time in HH:MM format (UTC)')
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('view')
          .setDescription('View the current bot configuration')
      )
  );

  // /schedule add — Everyone
  command.addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add a stream to this week\'s schedule')
      .addStringOption((option) => {
        option
          .setName('day')
          .setDescription('Day of the week for your stream')
          .setRequired(true);
        for (const choice of DAY_CHOICES) {
          option.addChoices({ name: choice.name, value: choice.value });
        }
        return option;
      })
      .addStringOption((option) =>
        option
          .setName('time')
          .setDescription('Start time in HH:MM format (24-hour)')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('title')
          .setDescription('Stream title (max 100 characters)')
          .setRequired(true)
          .setMaxLength(100)
      )
  );

  // /schedule remove — Everyone
  command.addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove a stream from this week\'s schedule')
      .addStringOption((option) => {
        option
          .setName('day')
          .setDescription('Day of the week')
          .setRequired(true);
        for (const choice of DAY_CHOICES) {
          option.addChoices({ name: choice.name, value: choice.value });
        }
        return option;
      })
      .addStringOption((option) =>
        option
          .setName('time')
          .setDescription('Start time of the stream to remove (HH:MM)')
          .setRequired(true)
      )
  );

  // /schedule mine — Everyone
  command.addSubcommand((sub) =>
    sub
      .setName('mine')
      .setDescription('View your schedule entries for this week')
  );

  // /schedule bulk — Everyone
  command.addSubcommand((sub) =>
    sub
      .setName('bulk')
      .setDescription('Add multiple schedule entries at once')
      .addStringOption((option) =>
        option
          .setName('entries')
          .setDescription('Entries separated by | e.g. Monday 09:00 Stream | Friday 20:00 Games')
          .setRequired(true)
          .setMaxLength(6000)
      )
  );

  return command;
}

/**
 * The built /schedule command instance.
 */
export const scheduleCommand = buildScheduleCommand();

/**
 * Returns all command definitions as JSON for REST registration.
 */
export function getCommandsJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [scheduleCommand.toJSON()];
}
