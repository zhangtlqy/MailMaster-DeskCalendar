import { useCallback, useEffect, useRef, useState } from 'react';
import type { DatesSetArg } from '@fullcalendar/core';
import type { MailMasterEvent } from '../types';
import { listMailMasterEvents } from '../services/tauriCommands';

const REFRESH_INTERVAL_MS = 60_000;

interface DateRange { start: number; end: number; }

export interface MailMasterEventsState {
  events: MailMasterEvent[];
  error: string | null;
  isLoading: boolean;
  setVisibleRange: (range: DatesSetArg) => void;
  refresh: () => Promise<void>;
}

/** Owns visible-range loading and periodic refresh for the read-only MailMaster source. */
export function useMailMasterEvents(): MailMasterEventsState {
  const [events, setEvents] = useState<MailMasterEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const rangeRef = useRef<DateRange | null>(null);

  const refresh = useCallback(async () => {
    const range = rangeRef.current;
    if (!range) return;
    setIsLoading(true);
    const result = await listMailMasterEvents(range.start, range.end);
    if (result.ok) {
      setEvents(result.value);
      setError(null);
    } else {
      setError(result.error.message);
    }
    setIsLoading(false);
  }, []);

  const setVisibleRange = useCallback((range: DatesSetArg) => {
    rangeRef.current = { start: range.start.getTime(), end: range.end.getTime() };
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { events, error, isLoading, setVisibleRange, refresh };
}
