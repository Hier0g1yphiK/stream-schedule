import cron from 'node-cron';
import { PostingService } from './services/posting-service.js';

/**
 * Starts the cron scheduler that checks for pending schedule posts every minute.
 *
 * The scheduler runs a `* * * * *` cron expression (every minute). On each tick,
 * it calls `PostingService.checkAndPost()` which queries all guilds and posts
 * schedules where the current UTC day/time match the configured posting window.
 *
 * Error handling ensures that a failure in checkAndPost does not crash the scheduler.
 *
 * Requirements: 5.1
 *
 * @param postingService - The PostingService instance to invoke on each tick
 * @returns The scheduled cron task (can be stopped for graceful shutdown)
 */
export function startScheduler(postingService: PostingService): cron.ScheduledTask {
  const task = cron.schedule('* * * * *', async () => {
    try {
      await postingService.checkAndPost();
    } catch (error) {
      console.error('[Scheduler] Error during checkAndPost:', error);
    }
  });

  console.log('[Scheduler] Started — checking every minute');
  return task;
}
