import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MailMasterCalendar, MailMasterEvent } from '../types';

function readSelection(key: string): number[] | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is number => Number.isSafeInteger(id) && id > 0))]
      : null;
  } catch { return null; }
}

/** Persist display choices per database without modifying MailMaster's own settings. */
export function useCalendarVisibility(databasePath: string, calendars: MailMasterCalendar[], events: MailMasterEvent[]) {
  const key = `deskcalendar.visible-calendars.v1:${databasePath || 'default'}`;
  const [stored, setStored] = useState(() => ({ key, ids: readSelection(key) }));
  useEffect(() => { setStored({ key, ids: readSelection(key) }); }, [key]);
  const selectedIds = useMemo(() => {
    const ids = stored.key === key ? stored.ids : readSelection(key);
    return new Set(ids ?? calendars.filter((calendar) => calendar.visible).map((calendar) => calendar.id));
  }, [stored, key, calendars]);
  const select = useCallback((ids: number[]) => {
    localStorage.setItem(key, JSON.stringify(ids));
    setStored({ key, ids });
  }, [key]);
  const visibleEvents = useMemo(() => events.filter((event) =>
    event.calendar_id !== undefined && selectedIds.has(event.calendar_id)), [events, selectedIds]);
  return { selectedIds, select, visibleEvents };
}
