import type { MailMasterEvent } from '../types';
import { formatEventTime } from './calendarSettings';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** Keep database IDs for writes and give each displayed occurrence a distinct key. */
export function mailMasterEventKey(event: MailMasterEvent): string {
  return event.instance_id ?? `${event.id}:${event.start_time}`;
}

/** MailMaster may store date-only values at UTC midnight, which is 08:00 locally. */
export function allDayDisplayRange(event: MailMasterEvent): { start: Date; end: Date } {
  const storedStart = new Date(event.start_time * 1000);
  const storedEnd = new Date(event.end_time * 1000);
  const start = new Date(storedStart.getFullYear(), storedStart.getMonth(), storedStart.getDate());
  const endDate = new Date(storedEnd.getFullYear(), storedEnd.getMonth(), storedEnd.getDate());
  const minimumEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  return { start, end: endDate > start ? endDate : minimumEnd };
}

export function eventsForDate(events: MailMasterEvent[], date: Date): MailMasterEvent[] {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000;
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() / 1000;
  return events
    .filter((event) => {
      if (!event.is_all_day) return event.start_time < end && (event.end_time > start
        || (event.start_time === event.end_time && event.start_time >= start));

      // MailMaster stores some all-day dates at UTC midnight. In UTC+8 those
      // timestamps become 08:00–08:00 and would incorrectly overlap day two.
      // All-day ranges are date-based and their end date is exclusive.
      const range = allDayDisplayRange(event);
      return range.start.getTime() / 1000 < end && range.end.getTime() / 1000 > start;
    })
    .sort((left, right) => Number(left.is_completed) - Number(right.is_completed)
      || Number(right.is_all_day) - Number(left.is_all_day)
      || left.start_time - right.start_time || left.id - right.id);
}

export function formatAgendaHeading(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
}

export function formatAgendaEventTime(event: MailMasterEvent): string {
  const start = new Date(event.start_time * 1000);
  const date = `${start.getMonth() + 1}月${start.getDate()}日 ${WEEKDAYS[start.getDay()]}`;
  return event.is_all_day ? `${date} 全天` : `${date} ${formatEventTime(start)}`;
}
