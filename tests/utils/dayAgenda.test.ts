import { describe, expect, it } from 'vitest';
import type { MailMasterEvent } from '../../src/types';
import { allDayDisplayRange, eventsForDate, formatAgendaEventTime, formatAgendaHeading, mailMasterEventKey } from '../../src/utils/dayAgenda';

const event = (id: number, start: Date, end: Date, allDay = false, completed = false): MailMasterEvent => ({
  id, title: `event-${id}`, start_time: start.getTime() / 1000, end_time: end.getTime() / 1000,
  is_all_day: allDay, calendar_name: 'test', color: '#ff0000',
  is_completed: completed,
  is_todo: true,
});

describe('dayAgenda', () => {
  it('uses different display keys for occurrences sharing a database ID', () => {
    const first = event(325, new Date(2026, 7, 31, 18, 30), new Date(2026, 7, 31, 20, 30));
    const second = event(325, new Date(2026, 8, 7, 18, 30), new Date(2026, 8, 7, 20, 30));
    expect(mailMasterEventKey(first)).not.toBe(mailMasterEventKey(second));
    expect(eventsForDate([first, second], new Date(2026, 8, 7))).toEqual([second]);
  });

  it('includes a point todo at midnight only on its own date', () => {
    const point = event(325, new Date(2026, 8, 7), new Date(2026, 8, 7));
    expect(eventsForDate([point], new Date(2026, 8, 7))).toEqual([point]);
    expect(eventsForDate([point], new Date(2026, 8, 6))).toEqual([]);
  });
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

it('treats UTC-midnight all-day ends as exclusive local dates', () => {
  const event = { id: 8, title: '中秋节', start_time: Date.UTC(2026, 8, 25) / 1000,
    end_time: Date.UTC(2026, 8, 26) / 1000, is_all_day: true } as any;
  const range = allDayDisplayRange(event);
  expect([range.start.getFullYear(), range.start.getMonth(), range.start.getDate()]).toEqual([2026, 8, 25]);
  expect([range.end.getFullYear(), range.end.getMonth(), range.end.getDate()]).toEqual([2026, 8, 26]);
  expect(eventsForDate([event], new Date(2026, 8, 25))).toEqual([event]);
  expect(eventsForDate([event], new Date(2026, 8, 26))).toEqual([]);
});
