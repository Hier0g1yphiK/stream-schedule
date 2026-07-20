import { describe, it, expect } from 'vitest';
import { parseBulkInput } from '../../src/utils/bulk-parser';

describe('parseBulkInput', () => {
  it('parses a single valid entry', () => {
    const result = parseBulkInput('Monday 09:00 Morning Stream');
    expect(result.entries).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.entries[0]).toEqual({
      day: 'Monday',
      startTime: '09:00',
      title: 'Morning Stream',
      lineNumber: 1,
    });
  });

  it('parses multiple pipe-separated entries', () => {
    const input = 'Monday 09:00 Morning Stream | Tuesday 14:00 Afternoon Coding | Friday 20:00 Game Night';
    const result = parseBulkInput(input);
    expect(result.entries).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.entries[0].day).toBe('Monday');
    expect(result.entries[1].day).toBe('Tuesday');
    expect(result.entries[2].day).toBe('Friday');
  });

  it('parses multiple newline-separated entries (fallback)', () => {
    const input = 'Monday 09:00 Morning Stream\nTuesday 14:00 Afternoon Coding\nFriday 20:00 Game Night';
    const result = parseBulkInput(input);
    expect(result.entries).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.entries[0].day).toBe('Monday');
    expect(result.entries[1].day).toBe('Tuesday');
    expect(result.entries[2].day).toBe('Friday');
  });

  it('skips empty segments between pipes', () => {
    const input = 'Monday 09:00 Stream ||Tuesday 14:00 Code';
    const result = parseBulkInput(input);
    expect(result.entries).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('skips whitespace-only segments', () => {
    const input = 'Monday 09:00 Stream |   | Tuesday 14:00 Code';
    const result = parseBulkInput(input);
    expect(result.entries).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('reports error for segments with fewer than 3 tokens', () => {
    const input = 'Monday 09:00 Stream | Monday | Tuesday 14:00 Code';
    const result = parseBulkInput(input);
    expect(result.entries).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].lineNumber).toBe(2);
    expect(result.errors[0].raw).toBe('Monday');
  });

  it('reports error for 2-token segments', () => {
    const input = 'Monday 09:00';
    const result = parseBulkInput(input);
    expect(result.entries).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].lineNumber).toBe(1);
    expect(result.errors[0].raw).toBe('Monday 09:00');
  });

  it('uses 1-based entry numbering counting only non-empty segments', () => {
    const input = 'Monday 09:00 Stream | | Bad | | Tuesday 14:00 Code';
    const result = parseBulkInput(input);
    expect(result.entries[0].lineNumber).toBe(1);
    expect(result.errors[0].lineNumber).toBe(2);
    expect(result.entries[1].lineNumber).toBe(3);
  });

  it('handles CRLF line endings (newline fallback)', () => {
    const input = 'Monday 09:00 Stream\r\nTuesday 14:00 Code\r\n';
    const result = parseBulkInput(input);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].title).toBe('Stream');
    expect(result.entries[1].title).toBe('Code');
  });

  it('preserves internal spaces in title', () => {
    const input = 'Monday 09:00 My   Spaced   Title';
    const result = parseBulkInput(input);
    expect(result.entries[0].title).toBe('My   Spaced   Title');
  });

  it('handles multiple spaces between tokens', () => {
    const input = 'Monday   09:00   Morning Stream';
    const result = parseBulkInput(input);
    expect(result.entries[0]).toEqual({
      day: 'Monday',
      startTime: '09:00',
      title: 'Morning Stream',
      lineNumber: 1,
    });
  });

  it('returns empty results for empty input', () => {
    const result = parseBulkInput('');
    expect(result.entries).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns empty results for whitespace-only input', () => {
    const result = parseBulkInput('   | | |  ');
    expect(result.entries).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('trims whitespace around pipe-delimited entries', () => {
    const input = '  Monday 09:00 Stream  |  Tuesday 14:00 Code  ';
    const result = parseBulkInput(input);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].title).toBe('Stream');
    expect(result.entries[1].title).toBe('Code');
  });
});

describe('parseBulkInput - edge cases', () => {
  describe('pipe delimiter edge cases', () => {
    it('handles pipes with no spaces around them', () => {
      const input = 'Monday 09:00 Stream|Tuesday 14:00 Code';
      const result = parseBulkInput(input);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].title).toBe('Stream');
      expect(result.entries[1].title).toBe('Code');
    });

    it('handles mixed pipe and newline delimiters', () => {
      const input = 'Monday 09:00 Stream A | Tuesday 14:00 Stream B\nWednesday 20:00 Stream C';
      const result = parseBulkInput(input);
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].title).toBe('Stream A');
      expect(result.entries[1].title).toBe('Stream B');
      expect(result.entries[2].title).toBe('Stream C');
    });

    it('handles input ending with pipe', () => {
      const input = 'Monday 09:00 Stream |';
      const result = parseBulkInput(input);
      expect(result.entries).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.entries[0].title).toBe('Stream');
    });

    it('handles input starting with pipe', () => {
      const input = '| Monday 09:00 Stream';
      const result = parseBulkInput(input);
      expect(result.entries).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Unicode characters in titles', () => {
    it('parses titles with emoji characters', () => {
      const input = 'Monday 09:00 🎮 Gaming Stream 🎮';
      const result = parseBulkInput(input);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].title).toBe('🎮 Gaming Stream 🎮');
    });

    it('parses titles with non-Latin scripts (Japanese)', () => {
      const input = 'Tuesday 14:00 ゲーム配信タイム';
      const result = parseBulkInput(input);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].title).toBe('ゲーム配信タイム');
    });

    it('parses titles with non-Latin scripts (Cyrillic)', () => {
      const input = 'Wednesday 20:00 Стрим по программированию';
      const result = parseBulkInput(input);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].title).toBe('Стрим по программированию');
    });

    it('parses titles with mixed Unicode and ASCII', () => {
      const input = 'Thursday 18:00 Café Stream ☕ with André';
      const result = parseBulkInput(input);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].title).toBe('Café Stream ☕ with André');
    });
  });

  describe('titles at max 100-character boundary', () => {
    it('parses a title that is exactly 100 characters long', () => {
      const title = 'a'.repeat(100);
      const input = `Monday 09:00 ${title}`;
      const result = parseBulkInput(input);
      expect(result.entries).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.entries[0].title).toBe(title);
      expect(result.entries[0].title.length).toBe(100);
    });

    it('parses a title that exceeds 100 characters (parser accepts, validation is separate)', () => {
      const title = 'b'.repeat(101);
      const input = `Tuesday 14:00 ${title}`;
      const result = parseBulkInput(input);
      expect(result.entries).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.entries[0].title).toBe(title);
      expect(result.entries[0].title.length).toBe(101);
    });
  });

  describe('mixed empty and valid segments', () => {
    it('handles multiple consecutive pipes (empty segments)', () => {
      const input = 'Monday 09:00 First ||| Tuesday 14:00 Second';
      const result = parseBulkInput(input);
      expect(result.entries).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.entries[0]).toMatchObject({ day: 'Monday', title: 'First', lineNumber: 1 });
      expect(result.entries[1]).toMatchObject({ day: 'Tuesday', title: 'Second', lineNumber: 2 });
    });

    it('handles mixed empty segments and error segments', () => {
      const input = 'Monday 09:00 Valid One | | BadEntry | | Tuesday 14:00 Valid Two';
      const result = parseBulkInput(input);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]).toMatchObject({ day: 'Monday', title: 'Valid One', lineNumber: 1 });
      expect(result.entries[1]).toMatchObject({ day: 'Tuesday', title: 'Valid Two', lineNumber: 3 });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].lineNumber).toBe(2);
      expect(result.errors[0].raw).toBe('BadEntry');
    });

    it('handles input consisting only of pipes and whitespace', () => {
      const input = ' | | | | ';
      const result = parseBulkInput(input);
      expect(result.entries).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
