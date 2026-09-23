import { useCallback, useEffect, useRef, useState } from 'react';
import type { DatesSetArg } from '@fullcalendar/core';
import type { MailMasterCalendar, MailMasterEvent } from '../types';
import { listMailMasterCalendars, listMailMasterEvents } from '../services/tauriCommands';

const REFRESH_INTERVAL_MS = 60_000;
const REFRESH_TIMEOUT_MS = 20_000;
interface DateRange { start: number; end: number; }
interface Request { key: string; promise: Promise<void>; }

export interface MailMasterEventsState {
  events: MailMasterEvent[];
  calendars: MailMasterCalendar[];
  error: string | null;
  isLoading: boolean;
  setVisibleRange: (range: DatesSetArg) => void;
  refresh: () => Promise<void>;
}

/** Dedupe range notifications and discard responses for a previous range or database. */
export function useMailMasterEvents(databasePath?: string): MailMasterEventsState {
  const [events, setEvents] = useState<MailMasterEvent[]>([]);
  const [calendars, setCalendars] = useState<MailMasterCalendar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const rangeRef = useRef<DateRange | null>(null);
  const activeRef = useRef<Request | null>(null);
  const generation = useRef(0);

  const load = useCallback((showLoading: boolean): Promise<void> => {
    const range = rangeRef.current;
    if (!range) return Promise.resolve();
    const key = JSON.stringify([databasePath, range.start, range.end]);
    if (activeRef.current?.key === key) {
      if (showLoading) setIsLoading(true);
      return activeRef.current.promise;
    }
    const requestId = ++generation.current;
    setIsLoading(showLoading);
    const promise = (async () => {
      let timeoutId: number | undefined;
      try {
        const timeout = new Promise<null>((resolve) => {
          timeoutId = window.setTimeout(() => resolve(null), REFRESH_TIMEOUT_MS);
        });
        const result = await Promise.race([
          Promise.all([
            listMailMasterEvents(range.start, range.end, databasePath),
            listMailMasterCalendars(databasePath),
          ]), timeout,
        ]);
        if (requestId !== generation.current) return;
        if (result === null) {
          setError('读取日历数据超时，请检查数据库路径或稍后手动刷新');
        } else {
          const [eventResult, calendarResult] = result;
          if (!eventResult.ok) setError(eventResult.error.message);
          else if (!calendarResult.ok) setError(calendarResult.error.message);
          else {
            setEvents(eventResult.value);
            setCalendars(calendarResult.value);
            setError(null);
          }
        }
      } catch (cause) {
        if (requestId === generation.current) {
          setError(`读取日历失败：${cause instanceof Error ? cause.message : String(cause)}`);
        }
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        if (requestId === generation.current) {
          setIsLoading(false);
          activeRef.current = null;
        }
      }
    })();
    activeRef.current = { key, promise };
    return promise;
  }, [databasePath]);

  const refresh = useCallback(() => load(true), [load]);
  const setVisibleRange = useCallback((range: DatesSetArg) => {
    const next = { start: range.start.getTime(), end: range.end.getTime() };
    if (rangeRef.current?.start === next.start && rangeRef.current.end === next.end) return;
    rangeRef.current = next;
    void load(true);
  }, [load]);

  useEffect(() => {
    setEvents([]);
    setCalendars([]);
    void load(true);
    const timer = window.setInterval(() => void load(false), REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      generation.current += 1;
      activeRef.current = null;
    };
  }, [load]);

  return { events, calendars, error, isLoading, setVisibleRange, refresh };
}
