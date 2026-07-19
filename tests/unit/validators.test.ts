import { describe, it, expect } from 'vitest';
import { validateTime, validateDay, validateTitle, validateEntry } from '../../src/utils/validators';

describe('validateTime', () => {
  it('accepts valid times', () => {
    expect(validateTime('00:00')).toEqual({ valid: true });
    expect(validateTime('12:30')).toEqual({ valid: true });
    expect(validateTime('23:59')).toEqual({ valid: true });
    expect(validateTime('09:05')).toEqual({ valid: true });
  });

  it('rejects times with hours out of range', () => {
    const result = validateTime('24:00');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('HH:MM');
  });

  it('rejects times with minutes out of range', () => {
    const result = validateTime('12:60');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('HH:MM');
  });

  it('rejects invalid formats', () => {
    expect(validateTime('1:30').valid).toBe(false);
    expect(validateTime('12:5').valid).toBe(false);
    expect(validateTime('12-30').valid).toBe(false);
    expect(validateTime('noon').valid).toBe(false);
    expect(validateTime('').valid).toBe(false);
    expect(validateTime('123:45').valid).toBe(false);
  });

  it('error message mentions expected format', () => {
    const result = validateTime('invalid');
    expect(result.error).toContain('HH:MM');
    expect(result.error).toContain('24-hour');
  });
});

describe('validateDay', () => {
  it('accepts all valid days (case-insensitive)', () => {
    expect(validateDay('Monday')).toEqual({ valid: true });
    expect(validateDay('monday')).toEqual({ valid: true });
    expect(validateDay('TUESDAY')).toEqual({ valid: true });
    expect(validateDay('wednesday')).toEqual({ valid: true });
    expect(validateDay('Thursday')).toEqual({ valid: true });
    expect(validateDay('FRIDAY')).toEqual({ valid: true });
    expect(validateDay('saturday')).toEqual({ valid: true });
    expect(validateDay('Sunday')).toEqual({ valid: true });
  });

  it('rejects invalid day names', () => {
    const result = validateDay('Funday');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Monday');
    expect(result.error).toContain('Sunday');
  });

  it('rejects abbreviations', () => {
    const result = validateDay('Mon');
    expect(result.valid).toBe(false);
  });

  it('rejects empty string', () => {
    const result = validateDay('');
    expect(result.valid).toBe(false);
  });

  it('error lists all seven valid day options', () => {
    const result = validateDay('invalid');
    expect(result.error).toContain('Monday');
    expect(result.error).toContain('Tuesday');
    expect(result.error).toContain('Wednesday');
    expect(result.error).toContain('Thursday');
    expect(result.error).toContain('Friday');
    expect(result.error).toContain('Saturday');
    expect(result.error).toContain('Sunday');
  });
});

describe('validateTitle', () => {
  it('accepts valid titles', () => {
    expect(validateTitle('My Stream')).toEqual({ valid: true });
    expect(validateTitle('a')).toEqual({ valid: true });
    expect(validateTitle('a'.repeat(100))).toEqual({ valid: true });
  });

  it('rejects empty titles', () => {
    const result = validateTitle('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('1');
    expect(result.error).toContain('100');
  });

  it('rejects titles exceeding 100 characters', () => {
    const result = validateTitle('a'.repeat(101));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('100');
  });
});

describe('validateEntry', () => {
  it('accepts a fully valid entry', () => {
    expect(validateEntry('Monday', '14:00', 'My Stream')).toEqual({ valid: true });
  });

  it('reports invalid day with field indicator', () => {
    const result = validateEntry('Funday', '14:00', 'My Stream');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Day');
  });

  it('reports invalid time with field indicator', () => {
    const result = validateEntry('Monday', '25:00', 'My Stream');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Time');
  });

  it('reports invalid title with field indicator', () => {
    const result = validateEntry('Monday', '14:00', '');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Title');
  });

  it('validates day first, then time, then title', () => {
    // All invalid — should report day error first
    const result = validateEntry('bad', 'bad', '');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Day');
  });
});
