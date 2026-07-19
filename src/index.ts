/**
 * Main entry point for the Discord Stream Schedule Bot.
 *
 * Responsibilities:
 * - Load environment variables from .env
 * - Initialize SQLite database
 * - Create service instances (ConfigService, ScheduleService)
 * - Create Discord client with required intents
 * - Register event handlers (ready, interactionCreate)
 * - Start cron scheduler after client is ready
 * - Handle graceful shutdown on SIGINT/SIGTERM
 */

import { Client, GatewayIntentBits, Events, ChatInputCommandInteraction } from 'discord.js';
import { config } from 'dotenv';
import { initializeDatabase } from './database/init.js';
import { ConfigService } from './services/config-service.js';
import { ScheduleService } from './services/schedule-service.js';
import { PostingService } from './services/posting-service.js';
import { handleSetupCommand } from './commands/setup.js';
import { handleScheduleCommand } from './commands/schedule.js';
import { startScheduler } from './scheduler.js';
import type { ScheduledTask } from 'node-cron';

// Load environment variables
config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) {
  console.error('[Bot] DISCORD_TOKEN is not set in environment variables.');
  process.exit(1);
}

// Initialize database
const db = initializeDatabase();

// Create service instances
const configService = new ConfigService(db);
const scheduleService = new ScheduleService(db);

// Create Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// Create posting service (needs client reference)
const postingService = new PostingService(client, db, configService, scheduleService);

// Scheduler reference for graceful shutdown
let schedulerTask: ScheduledTask | null = null;

// --- Event Handlers ---

client.once(Events.ClientReady, (readyClient) => {
  console.log(`[Bot] Logged in as ${readyClient.user.tag}`);
  console.log(`[Bot] Serving ${readyClient.guilds.cache.size} guild(s)`);

  // Start the cron scheduler
  schedulerTask = startScheduler(postingService);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName !== 'schedule') return;

  try {
    const subcommandGroup = interaction.options.getSubcommandGroup(false);

    if (subcommandGroup === 'setup') {
      await handleSetupCommand(interaction as ChatInputCommandInteraction, configService);
    } else {
      await handleScheduleCommand(interaction as ChatInputCommandInteraction, configService, scheduleService);
    }
  } catch (error) {
    console.error('[Bot] Error handling interaction:', error);

    // Attempt to reply with an error message if the interaction hasn't been replied to
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '❌ An unexpected error occurred. Please try again later.',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: '❌ An unexpected error occurred. Please try again later.',
          ephemeral: true,
        });
      }
    } catch {
      // Interaction may have expired — nothing more we can do
      console.error('[Bot] Failed to send error response to user.');
    }
  }
});

// --- Graceful Shutdown ---

function shutdown(signal: string): void {
  console.log(`[Bot] Received ${signal}. Shutting down gracefully...`);

  // Stop the scheduler
  if (schedulerTask) {
    schedulerTask.stop();
    console.log('[Bot] Scheduler stopped.');
  }

  // Close the database
  db.close();
  console.log('[Bot] Database closed.');

  // Destroy the Discord client
  client.destroy();
  console.log('[Bot] Discord client destroyed.');

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// --- Login ---

client.login(DISCORD_TOKEN);
