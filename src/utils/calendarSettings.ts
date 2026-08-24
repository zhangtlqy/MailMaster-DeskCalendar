import type { CalendarSettings } from '../types/calendar-settings.types';

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  backgroundColor: '#fafaf9',
  opacity: 0.94,
  titleColor: '#1c1917',
  titleFontSize: 18,
  dateColor: '#1c1917',
  dateFontSize: 16,
  cellTextColor: '#57534e',
  cellFontSize: 12,
  eventTextColor: '#1c1917',
  eventMarkerStyle: 'dot',
  mailMasterDbPath: '',
  autoStart: false,
  lockWindow: false,
  visibleWeeks: 6,
  firstWeekOffset: 0,
  weekOneNaturalWeek: 1,
  weekdayStyle: 'short',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function sanitizeCalendarSettings(value: Partial<CalendarSettings>): CalendarSettings {
  const validColor = (color: string | undefined, fallback: string) =>
    /^#[0-9a-f]{6}$/i.test(color ?? '') ? color! : fallback;
  return {
    ...DEFAULT_CALENDAR_SETTINGS,
    ...value,
    backgroundColor: validColor(value.backgroundColor, DEFAULT_CALENDAR_SETTINGS.backgroundColor),
    opacity: clamp(Number(value.opacity ?? DEFAULT_CALENDAR_SETTINGS.opacity), 0.05, 1),
    titleColor: validColor(value.titleColor, DEFAULT_CALENDAR_SETTINGS.titleColor),
    titleFontSize: Math.round(clamp(Number(value.titleFontSize ?? 18), 12, 36)),
    dateColor: validColor(value.dateColor, DEFAULT_CALENDAR_SETTINGS.dateColor),
    dateFontSize: Math.round(clamp(Number(value.dateFontSize ?? 16), 10, 30)),
    cellTextColor: validColor(value.cellTextColor, DEFAULT_CALENDAR_SETTINGS.cellTextColor),
    cellFontSize: Math.round(clamp(Number(value.cellFontSize ?? 12), 9, 24)),
    eventTextColor: validColor(value.eventTextColor, DEFAULT_CALENDAR_SETTINGS.eventTextColor),
    eventMarkerStyle: value.eventMarkerStyle === 'bar' ? 'bar' : 'dot',
    mailMasterDbPath: typeof value.mailMasterDbPath === 'string' ? value.mailMasterDbPath : '',
    autoStart: Boolean(value.autoStart),
    visibleWeeks: Math.round(clamp(Number(value.visibleWeeks ?? 6), 4, 8)),
    firstWeekOffset: Math.round(clamp(Number(value.firstWeekOffset ?? 0), -4, 4)),
    weekOneNaturalWeek: Math.round(clamp(Number(value.weekOneNaturalWeek ?? 1), 1, 53)),
    weekdayStyle: value.weekdayStyle === 'chinese' || value.weekdayStyle === 'long'
      ? value.weekdayStyle
      : 'short',
    lockWindow: Boolean(value.lockWindow),
  };
}

const WEEKDAY_LABELS = {
  chinese: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
  long: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  short: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
} as const;

export function weekdayHeaderLabel(date: Date, style: CalendarSettings['weekdayStyle']): string {
  return WEEKDAY_LABELS[style][date.getDay()];
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

/** Locale-independent 24-hour event time. */
export function formatEventTime(date: Date | null): string {
  if (!date) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function mondayOnOrBefore(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

/** Natural week count where the week containing January 1 is week 1. */
export function naturalWeekNumber(date: Date): number {
  const firstWeek = mondayOnOrBefore(new Date(date.getFullYear(), 0, 1));
  const currentWeek = mondayOnOrBefore(date);
  return Math.floor((currentWeek.getTime() - firstWeek.getTime()) / 604_800_000) + 1;
}

export function displayWeekNumber(date: Date, weekOneNaturalWeek: number): number {
  const natural = naturalWeekNumber(date);
  const firstWeek = mondayOnOrBefore(new Date(date.getFullYear(), 0, 1));
  const nextFirstWeek = mondayOnOrBefore(new Date(date.getFullYear() + 1, 0, 1));
  const weeksInYear = Math.round((nextFirstWeek.getTime() - firstWeek.getTime()) / 604_800_000);
  return ((natural - weekOneNaturalWeek + weeksInYear) % weeksInYear) + 1;
}
