/**
 * Utility for converting schedule times to Discord timestamps.
 *
 * Discord timestamps use the format <t:UNIX_SECONDS:STYLE> and render
 * in each user's local timezone automatically.
 *
 * Styles:
 * - t = short time (e.g., 9:00 AM)
 * - T = long time (e.g., 9:00:00 AM)
 * - d = short date
 * - D = long date
 * - f = short date/time (default)
 * - F = long date/time
 * - R = relative
 */

import { DayOfWeek } from '../types/index.js';

/** Map DayOfWeek to ISO day number (Monday=1, Sunday=7). */
const DAY_TO_ISO: Record<DayOfWeek, number> = {
  [DayOfWeek.Monday]: 1,
  [DayOfWeek.Tuesday]: 2,
  [DayOfWeek.Wednesday]: 3,
  [DayOfWeek.Thursday]: 4,
  [DayOfWeek.Friday]: 5,
  [DayOfWeek.Saturday]: 6,
  [DayOfWeek.Sunday]: 7,
};

/**
 * Parses an ISO week ID (e.g., "2026-W30") into year and week number.
 */
function parseWeekId(weekId: string): { year: number; week: number } {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid weekId format: ${weekId}`);
  }
  return { year: parseInt(match[1], 10), week: parseInt(match[2], 10) };
}

/**
 * Gets the date of a specific ISO day within an ISO week.
 * ISO weeks start on Monday. Week 1 contains the year's first Thursday.
 */
function getDateForISOWeekDay(year: number, week: number, isoDayNumber: number): Date {
  // January 4th is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  // Find the Monday of week 1
  const jan4DayOfWeek = jan4.getUTCDay() || 7; // Convert Sunday (0) to 7
  const mondayOfWeek1 = new Date(jan4.getTime() - (jan4DayOfWeek - 1) * 86400000);

  // Calculate target date: Monday of target week + day offset
  const targetDate = new Date(mondayOfWeek1.getTime() + ((week - 1) * 7 + (isoDayNumber - 1)) * 86400000);
  return targetDate;
}

/**
 * Converts a DayOfWeek + HH:MM time + weekId into a Unix timestamp (seconds).
 *
 * @param day - The day of week (e.g., DayOfWeek.Monday)
 * @param startTime - Time in HH:MM format (UTC)
 * @param weekId - ISO week identifier (e.g., "2026-W30")
 * @returns Unix timestamp in seconds
 */
export function getUnixTimestamp(day: DayOfWeek, startTime: string, weekId: string): number {
  const { year, week } = parseWeekId(weekId);
  const isoDayNum = DAY_TO_ISO[day];
  const date = getDateForISOWeekDay(year, week, isoDayNum);

  const [hours, minutes] = startTime.split(':').map(Number);
  date.setUTCHours(hours, minutes, 0, 0);

  return Math.floor(date.getTime() / 1000);
}

/**
 * Formats a schedule time as a Discord timestamp string.
 *
 * @param day - The day of week
 * @param startTime - Time in HH:MM format (UTC)
 * @param weekId - ISO week identifier
 * @param style - Discord timestamp style (default: 't' for short time)
 * @returns Discord timestamp markup e.g., "<t:1753005600:t>"
 */
export function formatDiscordTimestamp(
  day: DayOfWeek,
  startTime: string,
  weekId: string,
  style: 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R' = 't'
): string {
  const unix = getUnixTimestamp(day, startTime, weekId);
  return `<t:${unix}:${style}>`;
}
