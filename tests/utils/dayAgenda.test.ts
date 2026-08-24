import { describe, expect, it } from 'vitest';
import type { MailMasterEvent } from '../../src/types';
import { eventsForDate, formatAgendaEventTime, formatAgendaHeading } from '../../src/utils/dayAgenda';

const event = (id: number, start: Date, end: Date, allDay = false, completed = false): MailMasterEvent => ({
  id, title: `event-${id}`, start_time: start.getTime() / 1000, end_time: end.getTime() / 1000,
  is_all_day: allDay, calendar_name: 'test', color: '#ff0000',
  is_completed: completed,
  is_todo: true,
});

describe('dayAgenda', () => {
  it('includes every event overlapping the selected local day', () => {
    const date = new Date(2026, 7, 27);
    const events = [
      event(1, new Date(2026, 7, 27, 9), new Date(2026, 7, 27, 10)),
      event(2, new Date(2026, 7, 26, 23), new Date(2026, 7, 27, 2)),
      event(3, new Date(2026, 7, 28, 0), new Date(2026, 7, 28, 1)),
    ];
    expect(eventsForDate(events, date).map((item) => item.id)).toEqual([2, 1]);
  });

  it('sorts all-day events before timed events', () => {
    const date = new Date(2026, 7, 27);
    const events = [
      event(1, new Date(2026, 7, 27, 8), new Date(2026, 7, 27, 9)),
      event(2, new Date(2026, 7, 27), new Date(2026, 7, 28), true),
    ];
    expect(eventsForDate(events, date).map((item) => item.id)).toEqual([2, 1]);
  });

  it('does not carry a UTC-midnight all-day event into its exclusive end date', () => {
    const allDay = event(1, new Date(2026, 7, 27, 8), new Date(2026, 7, 28, 8), true);
    expect(eventsForDate([allDay], new Date(2026, 7, 27)).map((item) => item.id)).toEqual([1]);
    expect(eventsForDate([allDay], new Date(2026, 7, 28))).toEqual([]);
  });

  it('sorts completed events below incomplete events', () => {
    const date = new Date(2026, 7, 27);
    const events = [
      event(1, new Date(2026, 7, 27, 8), new Date(2026, 7, 27, 9), false, true),
      event(2, new Date(2026, 7, 27, 10), new Date(2026, 7, 27, 11)),
    ];
    expect(eventsForDate(events, date).map((item) => item.id)).toEqual([2, 1]);
  });

  it('formats heading and time without localized hour suffixes', () => {
    const start = new Date(2026, 7, 27, 9, 5);
    expect(formatAgendaHeading(start)).toBe('8月27日 周四');
    expect(formatAgendaEventTime(event(1, start, new Date(2026, 7, 27, 10)))).toBe('8月27日 周四 09:05');
  });
});
