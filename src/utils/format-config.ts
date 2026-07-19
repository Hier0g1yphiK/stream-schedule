/**
 * Utility for formatting configuration summaries and confirmation messages.
 */

/**
 * Formats a complete bot configuration into a human-readable summary message.
 * The summary contains the channel name, posting day, and posting time.
 *
 * @param channelName - The name or mention of the configured channel
 * @param postingDay - The configured posting day (e.g. "Monday")
 * @param postingTime - The configured posting time in HH:MM UTC format
 * @returns A formatted summary string containing all three configuration values
 */
export function formatConfigSummary(channelName: string, postingDay: string, postingTime: string): string {
  return (
    `📋 **Current Configuration**\n` +
    `• Channel: ${channelName}\n` +
    `• Posting Day: ${postingDay}\n` +
    `• Posting Time: ${postingTime} UTC`
  );
}


/**
 * Formats a confirmation message shown to a user after successfully adding a schedule entry.
 * The message contains the entry's day, start time, and title.
 *
 * @param day - The day of the week for the entry (e.g. "Monday")
 * @param startTime - The start time in HH:MM format
 * @param title - The stream title
 * @returns A formatted confirmation string containing all three entry details
 */
export function formatEntryConfirmation(day: string, startTime: string, title: string): string {
  return `✅ Schedule entry saved!\n• Day: ${day}\n• Time: ${startTime} UTC\n• Title: ${title}`;
}
