/**
 * Week boundary and posting time logic for the Discord Stream Schedule Bot.
 *
 * The week boundary is defined by the guild's configured posting day and time.
 * A new week begins immediately after the posting time passes. All times are UTC.
 */

import { DayOfWeek } from '../types/index.js';

/** Map DayOfWeek enum values to JS Date day numbers (0=Sunday, 1=Monday, ..., 6=Saturday) */
const DAY_TO_NUMBER: Record<DayOfWeek, number> = {
  [DayOfWeek.Sunday]: 0,
  [DayOfWeek.Monday]: 1,
  [DayOfWeek.Tuesday]: 2,
  [DayOfWeek.Wednesday]: 3,
  [DayOfWeek.Thursday]: 4,
  [DayOfWeek.Friday]: 5,
  [DayOfWeek.Saturday]: 6,
};

/**
 * Parse a posting time string "HH:MM" into hours and minutes.
 */
function parseTime(postingTime: string): { hours: number; minutes: number } {
  const [h, m] = postingTime.split(':').map(Number);
  return { hours: h, minutes: m };
}

/**
 * Get the ISO 8601 week number and year for a given date.
 * ISO weeks start on Monday. Week 1 is the week containing the first Thursday of the year.
 */
function getISOWeekData(date: Date): { year: number; week: number } {
  // Create a copy to avoid mutating the original
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  // Set to nearest Thursday: current date + 4 - current day number (Monday=1, Sunday=7)
  const dayNum = d.getUTCDay() || 7; // Convert Sunday (0) to 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);

  // Get first day of year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));

  // Calculate full weeks to nearest Thursday
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return { year: d.getUTCFullYear(), week: weekNo };
}

/**
 * Format an ISO week identifier string: YYYY-Www
 */
function formatWeekId(year: number, week: number): string {
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

/**
 * Compute the posting Date for the current or most recent posting cycle relative to `from`.
 * This returns the Date of the configured posting day/time in the same week as `from`,
 * or the previous week if today is before the posting day.
 */
function getPostingDateForCurrentCycle(postingDay: DayOfWeek, postingTime: string, from: Date): Date {
  const { hours, minutes } = parseTime(postingTime);
  const targetDayNum = DAY_TO_NUMBER[postingDay];
  const currentDayNum = from.getUTCDay();

  // Compute difference in days from current day to posting day
  let dayDiff = targetDayNum - currentDayNum;

  // Build the posting date for this week
  const postingDate = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate() + dayDiff,
    hours,
    minutes,
    0,
    0
  ));

  return postingDate;
}

/**
 * Returns the ISO week string (YYYY-Www) for the current scheduling week.
 *
 * The week boundary is defined by the posting day and time. Before the posting
 * time on the posting day, we are in the "current" week. After the posting time
 * passes, the next week begins (so entries submitted after posting go to the next week).
 *
 * The week ID corresponds to the ISO week of the posting date for that cycle.
 */
export function getCurrentWeekId(postingDay: DayOfWeek, postingTime: string, now?: Date): string {
  const current = now ?? new Date();
  const postingDateThisWeek = getPostingDateForCurrentCycle(postingDay, postingTime, current);

  if (current.getTime() >= postingDateThisWeek.getTime()) {
    // Posting time has passed — we are now in the "next" week's collection period.
    // The next posting date defines the week ID.
    const nextPostingDate = new Date(postingDateThisWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { year, week } = getISOWeekData(nextPostingDate);
    return formatWeekId(year, week);
  } else {
    // Before posting time — we are still in the current week's collection period.
    // The current posting date defines the week ID.
    const { year, week } = getISOWeekData(postingDateThisWeek);
    return formatWeekId(year, week);
  }
}

/**
 * Returns the ISO week string (YYYY-Www) for the week AFTER the current scheduling week.
 * This is always one week ahead of getCurrentWeekId.
 */
export function getNextWeekId(postingDay: DayOfWeek, postingTime: string, now?: Date): string {
  const currentWeekId = getCurrentWeekId(postingDay, postingTime, now);
  // Parse the current week ID and add 1 week
  const match = currentWeekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid weekId: ${currentWeekId}`);
  }
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);

  // To get the next week's ID correctly (handling year boundaries),
  // find the Monday of the current ISO week, add 7 days, and compute its ISO week.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayOfWeek1 = new Date(jan4.getTime() - (jan4Day - 1) * 86400000);
  const mondayOfCurrentWeek = new Date(mondayOfWeek1.getTime() + (week - 1) * 7 * 86400000);
  const mondayOfNextWeek = new Date(mondayOfCurrentWeek.getTime() + 7 * 86400000);

  const { year: nextYear, week: nextWeek } = getISOWeekData(mondayOfNextWeek);
  return formatWeekId(nextYear, nextWeek);
}

/**
 * Computes the next posting Date (UTC) from a given reference point.
 *
 * If the posting day/time has not yet passed in the current week relative to `from`,
 * returns that posting date. Otherwise, returns the posting date for the following week.
 */
export function getNextPostingDate(postingDay: DayOfWeek, postingTime: string, from?: Date): Date {
  const current = from ?? new Date();
  const postingDateThisWeek = getPostingDateForCurrentCycle(postingDay, postingTime, current);

  if (current.getTime() < postingDateThisWeek.getTime()) {
    // Posting time hasn't passed yet this week
    return postingDateThisWeek;
  } else {
    // Posting time has already passed — next posting is next week
    return new Date(postingDateThisWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Returns true if `now` is within a 5-minute window of the configured posting time.
 * The window spans from posting time to posting time + 5 minutes (inclusive start, exclusive end).
 *
 * This is used by the scheduler which ticks every minute.
 */
export function isPostingTime(postingDay: DayOfWeek, postingTime: string, now?: Date): boolean {
  const current = now ?? new Date();
  const postingDateThisWeek = getPostingDateForCurrentCycle(postingDay, postingTime, current);

  const diff = current.getTime() - postingDateThisWeek.getTime();

  // Within [0, 5 minutes) window
  return diff >= 0 && diff < 5 * 60 * 1000;
}

/**
 * Returns true if the posting time has already passed for the current week.
 *
 * Used to determine whether new schedule entries should be assigned to the
 * next week's schedule rather than the current one.
 */
export function hasPostingTimePassed(postingDay: DayOfWeek, postingTime: string, now?: Date): boolean {
  const current = now ?? new Date();
  const postingDateThisWeek = getPostingDateForCurrentCycle(postingDay, postingTime, current);

  return current.getTime() >= postingDateThisWeek.getTime();
}
