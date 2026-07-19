import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve(process.cwd(), 'data', 'schedule.db');

/**
 * Initializes the SQLite database, creating tables and indexes if they don't exist.
 * Returns the database instance for use throughout the application.
 */
export function initializeDatabase(dbPath: string = DB_PATH): Database.Database {
  // Ensure the directory exists (skip for in-memory databases)
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT,
      posting_day TEXT,
      posting_time TEXT,
      last_posted_week TEXT
    );

    CREATE TABLE IF NOT EXISTS schedule_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      day TEXT NOT NULL,
      start_time TEXT NOT NULL,
      title TEXT NOT NULL,
      week_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(guild_id, user_id, day, start_time, week_id)
    );

    CREATE INDEX IF NOT EXISTS idx_entries_guild_week
      ON schedule_entries(guild_id, week_id);

    CREATE INDEX IF NOT EXISTS idx_entries_user_week
      ON schedule_entries(guild_id, user_id, week_id);
  `);

  return db;
}

/**
 * Creates an in-memory database for testing purposes.
 * Uses the same schema as the file-based database.
 */
export function initializeTestDatabase(): Database.Database {
  return initializeDatabase(':memory:');
}
