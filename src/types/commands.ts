/**
 * Command option type definitions for Discord slash commands.
 */

import { DayOfWeek } from './index.js';

/**
 * Options for the `/schedule setup channel` subcommand.
 */
export interface SetupChannelOptions {
  channel: string; // Channel ID (TextChannel)
}

/**
 * Options for the `/schedule setup day` subcommand.
 */
export interface SetupDayOptions {
  day: DayOfWeek;
}

/**
 * Options for the `/schedule setup time` subcommand.
 */
export interface SetupTimeOptions {
  time: string; // HH:MM in UTC
}

/**
 * Options for the `/schedule add` command.
 */
export interface ScheduleAddOptions {
  day: string; // Day choice (validated to DayOfWeek)
  time: string; // HH:MM start time
  title: string; // Stream title (1-100 characters)
}

/**
 * Options for the `/schedule remove` command.
 */
export interface ScheduleRemoveOptions {
  day: string; // Day choice (validated to DayOfWeek)
  time: string; // HH:MM start time
}

/**
 * Day choice entries used for Discord slash command choice options.
 */
export interface DayChoice {
  name: string;
  value: DayOfWeek;
}

/**
 * All available day choices for command option builders.
 */
export const DAY_CHOICES: DayChoice[] = [
  { name: 'Monday', value: DayOfWeek.Monday },
  { name: 'Tuesday', value: DayOfWeek.Tuesday },
  { name: 'Wednesday', value: DayOfWeek.Wednesday },
  { name: 'Thursday', value: DayOfWeek.Thursday },
  { name: 'Friday', value: DayOfWeek.Friday },
  { name: 'Saturday', value: DayOfWeek.Saturday },
  { name: 'Sunday', value: DayOfWeek.Sunday },
];
