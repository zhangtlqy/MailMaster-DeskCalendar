import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCalendarVisibility } from '../../src/hooks/useCalendarVisibility';
import type { MailMasterCalendar, MailMasterEvent } from '../../src/types';

const calendars: MailMasterCalendar[] = [
  { id: 1, name: '默认', color: '#ff0000', visible: true },
  { id: 2, name: '默认', color: '#00ff00', visible: false },
  { id: 3, name: '空日历', color: '#0000ff', visible: true },
];
const events: MailMasterEvent[] = [1, 2].map((id) => ({
  id, calendar_id: id, title: '事项', start_time: 100, end_time: 200, is_all_day: false,
  calendar_name: '默认', color: '#ff0000', is_todo: true, is_completed: false,
}));

describe('calendar visibility', () => {
  beforeEach(() => localStorage.clear());
  it('defaults to MailMaster visibility and filters by ID instead of duplicate names', () => {
    const { result } = renderHook(() => useCalendarVisibility('db-a', calendars, events));
    expect([...result.current.selectedIds]).toEqual([1, 3]);
    expect(result.current.visibleEvents.map((event) => event.id)).toEqual([1]);
    act(() => result.current.select([2]));
    expect(result.current.visibleEvents.map((event) => event.id)).toEqual([2]);
  });
  it('remembers selecting none across restart and isolates databases', () => {
    const first = renderHook(() => useCalendarVisibility('db-a', calendars, events));
    act(() => first.result.current.select([]));
    first.unmount();
    const { result, rerender } = renderHook(({ path }) => useCalendarVisibility(path, calendars, events),
      { initialProps: { path: 'db-a' } });
    expect(result.current.visibleEvents).toEqual([]);
    rerender({ path: 'db-b' });
    expect(result.current.visibleEvents.map((event) => event.id)).toEqual([1]);
  });
});
