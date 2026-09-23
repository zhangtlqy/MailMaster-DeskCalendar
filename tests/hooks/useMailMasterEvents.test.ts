import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DatesSetArg } from '@fullcalendar/core';
import { useMailMasterEvents } from '../../src/hooks/useMailMasterEvents';

const { list, calendars } = vi.hoisted(() => ({ list: vi.fn(), calendars: vi.fn() }));
vi.mock('../../src/services/tauriCommands', () => ({ listMailMasterEvents: list, listMailMasterCalendars: calendars }));

describe('MailMaster automatic refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    list.mockReset().mockResolvedValue({ ok: true, value: [] });
    calendars.mockReset().mockResolvedValue({ ok: true, value: [] });
  });

  it('does not reload identical datesSet notifications after finishing a request', async () => {
    const { result, unmount } = renderHook(() => useMailMasterEvents('calendar.db'));
    const range = { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) } as DatesSetArg;
    await act(async () => result.current.setVisibleRange(range));
    expect(result.current.isLoading).toBe(false);
    for (let i = 0; i < 5; i++) await act(async () => result.current.setVisibleRange({ ...range }));
    expect(list).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.refresh(); });
    expect(list).toHaveBeenCalledTimes(2);
    expect(result.current.isLoading).toBe(false);
    unmount();
  });

  it('stops loading on timeout and allows a successful manual retry', async () => {
    list.mockImplementationOnce(() => new Promise(() => {}));
    const { result, unmount } = renderHook(() => useMailMasterEvents('calendar.db'));
    act(() => result.current.setVisibleRange({ start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) } as DatesSetArg));
    expect(result.current.isLoading).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toContain('超时');
    await act(async () => { await result.current.refresh(); });
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('stops loading after a rejected request', async () => {
    list.mockRejectedValueOnce(new Error('IPC unavailable'));
    const { result, unmount } = renderHook(() => useMailMasterEvents('calendar.db'));
    await act(async () => result.current.setVisibleRange({ start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) } as DatesSetArg));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toContain('IPC unavailable');
    unmount();
  });

  it('ignores responses for the previous date range', async () => {
    let resolveOld!: (value: { ok: boolean; value: [] }) => void;
    list.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const { result, unmount } = renderHook(() => useMailMasterEvents('calendar.db'));
    act(() => result.current.setVisibleRange({ start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) } as DatesSetArg));
    list.mockResolvedValueOnce({ ok: false, error: { message: 'Latest range error' } });
    await act(async () => result.current.setVisibleRange({ start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) } as DatesSetArg));
    await act(async () => resolveOld({ ok: true, value: [] }));
    expect(result.current.error).toBe('Latest range error');
    expect(result.current.isLoading).toBe(false);
    unmount();
  });
  afterEach(() => vi.useRealTimers());

  it('loads immediately and every 60 seconds, then stops on unmount', async () => {
    const { result, unmount } = renderHook(() => useMailMasterEvents('calendar.db'));
    const start = new Date(2026, 8, 1), end = new Date(2026, 9, 1);
    await act(async () => result.current.setVisibleRange({ start, end } as DatesSetArg));
    expect(list).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
    expect(list).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenLastCalledWith(start.getTime(), end.getTime(), 'calendar.db');
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(list).toHaveBeenCalledTimes(2);
  });
});
