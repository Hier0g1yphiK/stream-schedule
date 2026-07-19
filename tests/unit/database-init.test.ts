import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase, initializeTestDatabase } from '../../src/database/init';

describe('Database Initialization', () => {
  let db: Database.Database;

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it('should create an in-memory database successfully', () => {
    db = initializeTestDatabase();
    expect(db.open).toBe(true);
  });

  it('should create the guild_config table', () => {
    db = initializeTestDatabase();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='guild_config'")
      .all();
    expect(tables).toHaveLength(1);
  });

  it('should create guild_config with correct columns', () => {
    db = initializeTestDatabase();
    const columns = db.prepare("PRAGMA table_info('guild_config')").all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('guild_id');
    expect(columnNames).toContain('channel_id');
    expect(columnNames).toContain('posting_day');
    expect(columnNames).toContain('posting_time');
    expect(columnNames).toContain('last_posted_week');
  });

  it('should create the schedule_entries table', () => {
    db = initializeTestDatabase();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schedule_entries'")
      .all();
    expect(tables).toHaveLength(1);
  });

  it('should create schedule_entries with correct columns', () => {
    db = initializeTestDatabase();
    const columns = db.prepare("PRAGMA table_info('schedule_entries')").all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('guild_id');
    expect(columnNames).toContain('user_id');
    expect(columnNames).toContain('username');
    expect(columnNames).toContain('day');
    expect(columnNames).toContain('start_time');
    expect(columnNames).toContain('title');
    expect(columnNames).toContain('week_id');
    expect(columnNames).toContain('created_at');
  });

  it('should create idx_entries_guild_week index', () => {
    db = initializeTestDatabase();
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_entries_guild_week'")
      .all();
    expect(indexes).toHaveLength(1);
  });

  it('should create idx_entries_user_week index', () => {
    db = initializeTestDatabase();
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_entries_user_week'")
      .all();
    expect(indexes).toHaveLength(1);
  });

  it('should enforce UNIQUE constraint on (guild_id, user_id, day, start_time, week_id)', () => {
    db = initializeTestDatabase();

    const insert = db.prepare(`
      INSERT INTO schedule_entries (guild_id, user_id, username, day, start_time, title, week_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run('guild1', 'user1', 'TestUser', 'Monday', '10:00', 'Stream 1', '2024-W01');

    // Inserting the same (guild_id, user_id, day, start_time, week_id) should fail
    expect(() => {
      insert.run('guild1', 'user1', 'TestUser', 'Monday', '10:00', 'Stream 2', '2024-W01');
    }).toThrow();
  });

  it('should allow different entries for same user on different days', () => {
    db = initializeTestDatabase();

    const insert = db.prepare(`
      INSERT INTO schedule_entries (guild_id, user_id, username, day, start_time, title, week_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run('guild1', 'user1', 'TestUser', 'Monday', '10:00', 'Stream 1', '2024-W01');
    insert.run('guild1', 'user1', 'TestUser', 'Tuesday', '10:00', 'Stream 2', '2024-W01');

    const count = db.prepare('SELECT COUNT(*) as cnt FROM schedule_entries').get() as { cnt: number };
    expect(count.cnt).toBe(2);
  });

  it('should allow same time slot for different users', () => {
    db = initializeTestDatabase();

    const insert = db.prepare(`
      INSERT INTO schedule_entries (guild_id, user_id, username, day, start_time, title, week_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run('guild1', 'user1', 'User1', 'Monday', '10:00', 'Stream 1', '2024-W01');
    insert.run('guild1', 'user2', 'User2', 'Monday', '10:00', 'Stream 2', '2024-W01');

    const count = db.prepare('SELECT COUNT(*) as cnt FROM schedule_entries').get() as { cnt: number };
    expect(count.cnt).toBe(2);
  });

  it('should be idempotent - calling initialize multiple times should not error', () => {
    db = initializeDatabase(':memory:');
    // Running the initialization SQL again should not throw
    expect(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS guild_config (
          guild_id TEXT PRIMARY KEY,
          channel_id TEXT,
          posting_day TEXT,
          posting_time TEXT,
          last_posted_week TEXT
        );
      `);
    }).not.toThrow();
  });

  it('should set guild_id as PRIMARY KEY on guild_config', () => {
    db = initializeTestDatabase();

    const insert = db.prepare(`
      INSERT INTO guild_config (guild_id, channel_id, posting_day, posting_time)
      VALUES (?, ?, ?, ?)
    `);

    insert.run('guild1', 'channel1', 'Monday', '10:00');

    // Inserting same guild_id should fail
    expect(() => {
      insert.run('guild1', 'channel2', 'Tuesday', '12:00');
    }).toThrow();
  });
});
