import type { MailMasterEvent } from '../types';
import { formatEventTime } from './calendarSettings';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function eventsForDate(events: MailMasterEvent[], date: Date): MailMasterEvent[] {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000;
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() / 1000;
  return events
    .filter((event) => event.start_time < end && event.end_time > start)
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
