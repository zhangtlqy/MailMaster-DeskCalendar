import type { CalendarSettings } from '../types/calendar-settings.types';

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  backgroundColor: '#fafaf9',
  opacity: 0.94,
  lockWindow: false,
  visibleWeeks: 6,
  firstWeekOffset: 0,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function sanitizeCalendarSettings(value: Partial<CalendarSettings>): CalendarSettings {
  const color = /^#[0-9a-f]{6}$/i.test(value.backgroundColor ?? '')
    ? value.backgroundColor!
    : DEFAULT_CALENDAR_SETTINGS.backgroundColor;
  return {
    ...DEFAULT_CALENDAR_SETTINGS,
    ...value,
    backgroundColor: color,
    opacity: clamp(Number(value.opacity ?? DEFAULT_CALENDAR_SETTINGS.opacity), 0.25, 1),
    visibleWeeks: Math.round(clamp(Number(value.visibleWeeks ?? 6), 1, 8)),
    firstWeekOffset: Math.round(clamp(Number(value.firstWeekOffset ?? 0), -4, 4)),
    lockWindow: Boolean(value.lockWindow),
  };
}

export function hexToRgba(hex: string, opacity: number): string {
  const value = hex.replace('#', '');
  const number = Number.parseInt(value, 16);
  return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${opacity})`;
}

/** Visible range begins on Monday of the month-opening week, shifted by the configured offset. */
export function getCalendarVisibleRange(anchor: Date, visibleWeeks: number, firstWeekOffset: number) {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const start = new Date(monthStart);
  start.setDate(monthStart.getDate() - mondayOffset + firstWeekOffset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + visibleWeeks * 7);
  return { start, end };
}

export function formatMonthTitle(anchor: Date): string {
  return `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`;
}

