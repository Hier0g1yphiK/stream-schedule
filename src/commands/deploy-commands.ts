/**
 * Script to register slash commands with the Discord API.
 *
 * Reads DISCORD_TOKEN, CLIENT_ID, and GUILD_ID from environment variables
 * and uses the Discord REST API to deploy the bot's slash commands.
 *
 * Usage: npm run deploy-commands
 */

import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { getCommandsJSON } from './index.js';

config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
  console.error('Error: DISCORD_TOKEN is not set in environment variables.');
  process.exit(1);
}

if (!clientId) {
  console.error('Error: CLIENT_ID is not set in environment variables.');
  process.exit(1);
}

if (!guildId) {
  console.error('Error: GUILD_ID is not set in environment variables.');
  process.exit(1);
}

const commands = getCommandsJSON();
const rest = new REST({ version: '10' }).setToken(token);

async function deployCommands(): Promise<void> {
  try {
    console.log(`Registering ${commands.length} application command(s)...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(clientId!, guildId!),
      { body: commands }
    );

    const registered = Array.isArray(data) ? data.length : 0;
    console.log(`Successfully registered ${registered} application command(s).`);
  } catch (error) {
    console.error('Failed to register application commands:', error);
    process.exit(1);
  }
}

deployCommands();
