/**
 * Shared types and enums for the Discord Stream Schedule Bot.
 */

/**
 * Days of the week used for schedule configuration and entries.
 * Values match the seven valid day options presented to users.
 */
export enum DayOfWeek {
  Monday = 'Monday',
  Tuesday = 'Tuesday',
  Wednesday = 'Wednesday',
  Thursday = 'Thursday',
  Friday = 'Friday',
  Saturday = 'Saturday',
  Sunday = 'Sunday',
}

/**
 * Stored bot configuration for a guild, including the target channel,
 * posting day, and posting time.
 */
export interface SetupConfiguration {
  guildId: string;
  channelId: string | null;
  postingDay: DayOfWeek | null;
  postingTime: string | null; // HH:MM in UTC
}

/**
 * A single schedule entry representing a streamer's planned stream
 * for a given week.
 */
export interface ScheduleEntry {
  id: number;
  guildId: string;
  userId: string;
  username: string;
  day: DayOfWeek;
  startTime: string; // HH:MM
  title: string;
  weekId: string; // ISO week identifier e.g. "2024-W03"
}

/**
 * Result of a validation operation, indicating whether the input
 * is valid and providing an error message when it is not.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}
