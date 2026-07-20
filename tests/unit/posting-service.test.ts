import { describe, it, expect } from 'vitest';
import { formatSchedule } from '../../src/services/posting-service';
import { DayOfWeek, ScheduleEntry } from '../../src/types';

function makeEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    id: 1,
    guildId: 'guild-1',
    userId: 'user-1',
    username: 'StreamerA',
    day: DayOfWeek.Monday,
    startTime: '10:00',
    title: 'Morning Stream',
    weekId: '2024-W03',
    ...overrides,
  };
}

describe('formatSchedule', () => {
  it('should return "no streams scheduled" message for empty entries (Req 5.3)', () => {
    const result = formatSchedule([]);

    expect(result).toContain('Weekly Stream Schedule');
    expect(result).toContain('No streams scheduled this week.');
  });

  it('should include header with weekly stream schedule title', () => {
    const entries = [makeEntry()];
    const result = formatSchedule(entries);

    expect(result).toContain('📅 **Weekly Stream Schedule**');
  });

  it('should group entries by day and display day name in bold', () => {
    const entries = [
      makeEntry({ day: DayOfWeek.Monday, startTime: '10:00', username: 'A', title: 'Mon Stream' }),
      makeEntry({ id: 2, day: DayOfWeek.Wednesday, startTime: '14:00', username: 'B', title: 'Wed Stream' }),
    ];

    const result = formatSchedule(entries);

    expect(result).toContain('**Monday**');
    expect(result).toContain('**Wednesday**');
    // Should not show days without entries
    expect(result).not.toContain('**Tuesday**');
    expect(result).not.toContain('**Thursday**');
  });

  it('should sort entries by start time within each day (Req 5.2)', () => {
    const entries = [
      makeEntry({ id: 1, day: DayOfWeek.Monday, startTime: '20:00', username: 'Late', title: 'Evening' }),
      makeEntry({ id: 2, day: DayOfWeek.Monday, startTime: '08:00', username: 'Early', title: 'Morning' }),
      makeEntry({ id: 3, day: DayOfWeek.Monday, startTime: '14:00', username: 'Mid', title: 'Afternoon' }),
    ];

    const result = formatSchedule(entries);

    const mondaySection = result.split('**Monday**')[1];
    // Discord timestamps encode time as unix seconds; earlier times have smaller values
    const earlyIndex = mondaySection.indexOf('Early');
    const midIndex = mondaySection.indexOf('Mid');
    const lateIndex = mondaySection.indexOf('Late');

    expect(earlyIndex).toBeLessThan(midIndex);
    expect(midIndex).toBeLessThan(lateIndex);
  });

  it('should display entries in Monday–Sunday order (Req 5.2)', () => {
    const entries = [
      makeEntry({ id: 1, day: DayOfWeek.Sunday, startTime: '10:00', username: 'Sun', title: 'Sunday' }),
      makeEntry({ id: 2, day: DayOfWeek.Wednesday, startTime: '10:00', username: 'Wed', title: 'Wednesday' }),
      makeEntry({ id: 3, day: DayOfWeek.Monday, startTime: '10:00', username: 'Mon', title: 'Monday' }),
    ];

    const result = formatSchedule(entries);

    const mondayIdx = result.indexOf('**Monday**');
    const wednesdayIdx = result.indexOf('**Wednesday**');
    const sundayIdx = result.indexOf('**Sunday**');

    expect(mondayIdx).toBeLessThan(wednesdayIdx);
    expect(wednesdayIdx).toBeLessThan(sundayIdx);
  });

  it('should format each entry with bullet, Discord timestamp, username, and title', () => {
    const entries = [
      makeEntry({ startTime: '14:30', username: 'CoolStreamer', title: 'Art Stream' }),
    ];

    const result = formatSchedule(entries);

    // Should contain a Discord timestamp pattern and the username/title
    expect(result).toMatch(/• <t:\d+:t> — CoolStreamer — Art Stream/);
  });

  it('should handle multiple streamers on the same day', () => {
    const entries = [
      makeEntry({ id: 1, userId: 'u1', username: 'Alice', startTime: '10:00', title: 'Morning Chill' }),
      makeEntry({ id: 2, userId: 'u2', username: 'Bob', startTime: '20:00', title: 'Evening Gameplay' }),
    ];

    const result = formatSchedule(entries);

    expect(result).toMatch(/• <t:\d+:t> — Alice — Morning Chill/);
    expect(result).toMatch(/• <t:\d+:t> — Bob — Evening Gameplay/);
  });

  it('should handle entries across all seven days', () => {
    const days = Object.values(DayOfWeek);
    const entries = days.map((day, i) =>
      makeEntry({ id: i + 1, day, startTime: `${(10 + i).toString().padStart(2, '0')}:00`, username: `Streamer${i}`, title: `${day} Stream` })
    );

    const result = formatSchedule(entries);

    for (const day of days) {
      expect(result).toContain(`**${day}**`);
    }
  });

  it('should only show days that have entries', () => {
    const entries = [
      makeEntry({ day: DayOfWeek.Friday, startTime: '18:00', username: 'WeekendStarter', title: 'TGIF' }),
    ];

    const result = formatSchedule(entries);

    expect(result).toContain('**Friday**');
    expect(result).not.toContain('**Monday**');
    expect(result).not.toContain('**Tuesday**');
    expect(result).not.toContain('**Wednesday**');
    expect(result).not.toContain('**Thursday**');
    expect(result).not.toContain('**Saturday**');
    expect(result).not.toContain('**Sunday**');
  });
});
