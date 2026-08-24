import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CALENDAR_SETTINGS,
  formatMonthTitle,
  getCalendarVisibleRange,
  hexToRgba,
  sanitizeCalendarSettings,
} from '../../src/utils/calendarSettings';

describe('calendarSettings', () => {
  it('sanitizes persisted values', () => {
    expect(sanitizeCalendarSettings({ opacity: 4, visibleWeeks: 0, firstWeekOffset: -9, backgroundColor: 'bad' }))
      .toMatchObject({
        opacity: 1,
        visibleWeeks: 1,
        firstWeekOffset: -4,
        backgroundColor: DEFAULT_CALENDAR_SETTINGS.backgroundColor,
      });
  });

  it('builds an exact Monday-aligned week range', () => {
    const range = getCalendarVisibleRange(new Date(2026, 7, 24), 4, 0);
    expect(range.start).toEqual(new Date(2026, 6, 27));
    expect(range.end).toEqual(new Date(2026, 7, 24));
  });

  it('shifts the first displayed week', () => {
    const range = getCalendarVisibleRange(new Date(2026, 7, 24), 2, 1);
    expect(range.start).toEqual(new Date(2026, 7, 3));
    expect(range.end).toEqual(new Date(2026, 7, 17));
  });

  it('formats colors and month titles', () => {
    expect(hexToRgba('#102030', 0.75)).toBe('rgba(16, 32, 48, 0.75)');
    expect(formatMonthTitle(new Date(2026, 7, 1))).toBe('2026年8月');
  });
});

