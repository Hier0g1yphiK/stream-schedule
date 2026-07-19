import { DayOfWeek, ValidationResult } from '../types/index';

/**
 * Valid day names mapped for case-insensitive lookup.
 */
const VALID_DAYS: string[] = Object.values(DayOfWeek);
const VALID_DAYS_LOWER: Map<string, DayOfWeek> = new Map(
  VALID_DAYS.map((day) => [day.toLowerCase(), day as DayOfWeek])
);

/**
 * Validates a time string in 24-hour HH:MM format.
 * Accepts 00:00 through 23:59.
 */
export function validateTime(input: string): ValidationResult {
  const timeRegex = /^(\d{2}):(\d{2})$/;
  const match = input.match(timeRegex);

  if (!match) {
    return {
      valid: false,
      error: 'Invalid time format. Expected HH:MM in 24-hour format (00:00 to 23:59).',
    };
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return {
      valid: false,
      error: 'Invalid time format. Expected HH:MM in 24-hour format (00:00 to 23:59).',
    };
  }

  return { valid: true };
}

/**
 * Validates a day name (case-insensitive).
 * Accepts Monday through Sunday.
 */
export function validateDay(input: string): ValidationResult {
  if (VALID_DAYS_LOWER.has(input.toLowerCase())) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Invalid day. Expected one of: ${VALID_DAYS.join(', ')}.`,
  };
}

/**
 * Validates a title string.
 * Must be between 1 and 100 characters inclusive.
 */
export function validateTitle(input: string): ValidationResult {
  if (input.length === 0) {
    return {
      valid: false,
      error: 'Invalid title. Title must be between 1 and 100 characters.',
    };
  }

  if (input.length > 100) {
    return {
      valid: false,
      error: 'Invalid title. Title must be between 1 and 100 characters.',
    };
  }

  return { valid: true };
}

/**
 * Validates a complete schedule entry by checking day, time, and title.
 * Returns the first validation error encountered.
 */
export function validateEntry(day: string, time: string, title: string): ValidationResult {
  const dayResult = validateDay(day);
  if (!dayResult.valid) {
    return {
      valid: false,
      error: `Day: ${dayResult.error}`,
    };
  }

  const timeResult = validateTime(time);
  if (!timeResult.valid) {
    return {
      valid: false,
      error: `Time: ${timeResult.error}`,
    };
  }

  const titleResult = validateTitle(title);
  if (!titleResult.valid) {
    return {
      valid: false,
      error: `Title: ${titleResult.error}`,
    };
  }

  return { valid: true };
}
