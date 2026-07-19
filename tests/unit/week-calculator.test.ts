import { describe, it, expect } from 'vitest';
import { DayOfWeek } from '../../src/types/index.js';
import {
  getCurrentWeekId,
  getNextPostingDate,
  isPostingTime,
  hasPostingTimePassed,
} from '../../src/utils/week-calculator.js';

describe('week-calculator', () => {
  describe('getCurrentWeekId', () => {
    it('returns the current week ID when before posting time', () => {
      // Wednesday 2024-01-17 10:00 UTC, posting is Friday 14:00
      // Posting hasn't happened yet, so we're collecting for the current week (posting on Friday Jan 19)
      const now = new Date(Date.UTC(2024, 0, 17, 10, 0));
      const weekId = getCurrentWeekId(DayOfWeek.Friday, '14:00', now);
      // Jan 19 2024 is in ISO week 3
      expect(weekId).toBe('2024-W03');
    });

    it('returns next week ID when posting time has passed', () => {
      // Friday 2024-01-19 15:00 UTC, posting was at 14:00
      // Posting already happened, so we're now collecting for next week
      const now = new Date(Date.UTC(2024, 0, 19, 15, 0));
      const weekId = getCurrentWeekId(DayOfWeek.Friday, '14:00', now);
      // Next posting is Jan 26 2024 which is in ISO week 4
      expect(weekId).toBe('2024-W04');
    });

    it('returns current week ID when exactly at posting time', () => {
      // At exactly posting time, it counts as "passed" (>= comparison)
      const now = new Date(Date.UTC(2024, 0, 19, 14, 0));
      const weekId = getCurrentWeekId(DayOfWeek.Friday, '14:00', now);
      // Posting time has arrived/passed, collecting for next week
      expect(weekId).toBe('2024-W04');
    });

    it('handles Sunday posting day correctly', () => {
      // Saturday 2024-01-20 10:00 UTC, posting is Sunday 12:00
      const now = new Date(Date.UTC(2024, 0, 20, 10, 0));
      const weekId = getCurrentWeekId(DayOfWeek.Sunday, '12:00', now);
      // Sunday Jan 21 is in ISO week 3
      expect(weekId).toBe('2024-W03');
    });

    it('handles Monday posting day correctly', () => {
      // Tuesday 2024-01-16 10:00 UTC, posting is Monday 09:00
      // Monday has already passed (we're on Tuesday), posting time passed
      const now = new Date(Date.UTC(2024, 0, 16, 10, 0));
      const weekId = getCurrentWeekId(DayOfWeek.Monday, '09:00', now);
      // Monday was Jan 15, it passed. Next posting is Jan 22 which is ISO week 4
      expect(weekId).toBe('2024-W04');
    });
  });

  describe('getNextPostingDate', () => {
    it('returns this week posting date when posting time has not passed', () => {
      // Wednesday 2024-01-17 10:00, posting is Friday 14:00
      const from = new Date(Date.UTC(2024, 0, 17, 10, 0));
      const next = getNextPostingDate(DayOfWeek.Friday, '14:00', from);
      expect(next).toEqual(new Date(Date.UTC(2024, 0, 19, 14, 0)));
    });

    it('returns next week posting date when posting time has passed', () => {
      // Friday 2024-01-19 15:00, posting was at 14:00
      const from = new Date(Date.UTC(2024, 0, 19, 15, 0));
      const next = getNextPostingDate(DayOfWeek.Friday, '14:00', from);
      expect(next).toEqual(new Date(Date.UTC(2024, 0, 26, 14, 0)));
    });

    it('returns next week when exactly at posting time', () => {
      // Exactly at posting time means it passed
      const from = new Date(Date.UTC(2024, 0, 19, 14, 0));
      const next = getNextPostingDate(DayOfWeek.Friday, '14:00', from);
      expect(next).toEqual(new Date(Date.UTC(2024, 0, 26, 14, 0)));
    });

    it('returns same day later when posting day is today but time has not passed', () => {
      // Friday 2024-01-19 13:00, posting is at 14:00
      const from = new Date(Date.UTC(2024, 0, 19, 13, 0));
      const next = getNextPostingDate(DayOfWeek.Friday, '14:00', from);
      expect(next).toEqual(new Date(Date.UTC(2024, 0, 19, 14, 0)));
    });

    it('handles Sunday to Monday transition', () => {
      // Sunday 2024-01-21 18:00, posting is Monday 09:00
      const from = new Date(Date.UTC(2024, 0, 21, 18, 0));
      const next = getNextPostingDate(DayOfWeek.Monday, '09:00', from);
      expect(next).toEqual(new Date(Date.UTC(2024, 0, 22, 9, 0)));
    });
  });

  describe('isPostingTime', () => {
    it('returns true when exactly at posting time', () => {
      const now = new Date(Date.UTC(2024, 0, 19, 14, 0));
      expect(isPostingTime(DayOfWeek.Friday, '14:00', now)).toBe(true);
    });

    it('returns true within 5-minute window (at 2 minutes)', () => {
      const now = new Date(Date.UTC(2024, 0, 19, 14, 2));
      expect(isPostingTime(DayOfWeek.Friday, '14:00', now)).toBe(true);
    });

    it('returns true at 4 minutes 59 seconds', () => {
      const now = new Date(Date.UTC(2024, 0, 19, 14, 4, 59));
      expect(isPostingTime(DayOfWeek.Friday, '14:00', now)).toBe(true);
    });

    it('returns false at exactly 5 minutes after', () => {
      const now = new Date(Date.UTC(2024, 0, 19, 14, 5, 0));
      expect(isPostingTime(DayOfWeek.Friday, '14:00', now)).toBe(false);
    });

    it('returns false one minute before posting time', () => {
      const now = new Date(Date.UTC(2024, 0, 19, 13, 59));
      expect(isPostingTime(DayOfWeek.Friday, '14:00', now)).toBe(false);
    });

    it('returns false on wrong day', () => {
      // Thursday at 14:00, but posting is Friday
      const now = new Date(Date.UTC(2024, 0, 18, 14, 0));
      expect(isPostingTime(DayOfWeek.Friday, '14:00', now)).toBe(false);
    });

    it('returns false on correct day but wrong time', () => {
      const now = new Date(Date.UTC(2024, 0, 19, 10, 0));
      expect(isPostingTime(DayOfWeek.Friday, '14:00', now)).toBe(false);
    });
  });

  describe('hasPostingTimePassed', () => {
    it('returns true when posting time has passed today', () => {
      // Friday 15:00, posting was at 14:00
      const now = new Date(Date.UTC(2024, 0, 19, 15, 0));
      expect(hasPostingTimePassed(DayOfWeek.Friday, '14:00', now)).toBe(true);
    });

    it('returns true exactly at posting time', () => {
      const now = new Date(Date.UTC(2024, 0, 19, 14, 0));
      expect(hasPostingTimePassed(DayOfWeek.Friday, '14:00', now)).toBe(true);
    });

    it('returns false when posting time has not passed yet', () => {
      // Friday 13:00, posting is at 14:00
      const now = new Date(Date.UTC(2024, 0, 19, 13, 0));
      expect(hasPostingTimePassed(DayOfWeek.Friday, '14:00', now)).toBe(false);
    });

    it('returns true when posting day has already passed this week', () => {
      // Saturday 10:00, posting was Friday 14:00
      const now = new Date(Date.UTC(2024, 0, 20, 10, 0));
      expect(hasPostingTimePassed(DayOfWeek.Friday, '14:00', now)).toBe(true);
    });

    it('returns false when posting day has not arrived yet', () => {
      // Wednesday 10:00, posting is Friday 14:00
      const now = new Date(Date.UTC(2024, 0, 17, 10, 0));
      expect(hasPostingTimePassed(DayOfWeek.Friday, '14:00', now)).toBe(false);
    });
  });
});
