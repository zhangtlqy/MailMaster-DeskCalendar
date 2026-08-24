import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CALENDAR_SETTINGS,
  formatEventTime,
  displayWeekNumber,
  formatMonthTitle,
  getCalendarVisibleRange,
  hexToRgba,
  sanitizeCalendarSettings,
  weekdayHeaderLabel,
} from '../../src/utils/calendarSettings';

describe('calendarSettings', () => {
  it('sanitizes persisted values', () => {
    expect(sanitizeCalendarSettings({ opacity: 0, visibleWeeks: 0, firstWeekOffset: -9, backgroundColor: 'bad', titleFontSize: 99 }))
      .toMatchObject({
        opacity: 0.05,
        visibleWeeks: 4,
        firstWeekOffset: -4,
        titleFontSize: 36,
        backgroundColor: DEFAULT_CALENDAR_SETTINGS.backgroundColor,
        weekdayStyle: 'short',
      });
  });

  it('formats weekday headers in all supported styles', () => {
    const monday = new Date(2026, 7, 24);
    expect(weekdayHeaderLabel(monday, 'chinese')).toBe('星期一');
    expect(weekdayHeaderLabel(monday, 'long')).toBe('Monday');
    expect(weekdayHeaderLabel(monday, 'short')).toBe('Mon');
  });

  it('counts natural weeks from the week containing January 1 and supports a display offset', () => {
    const thirdNaturalWeek = new Date(2026, 0, 12);
    expect(displayWeekNumber(thirdNaturalWeek, 1)).toBe(3);
    expect(displayWeekNumber(thirdNaturalWeek, 3)).toBe(1);
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
    expect(formatEventTime(new Date(2026, 7, 1, 9, 5))).toBe('09:05');
  });
});
