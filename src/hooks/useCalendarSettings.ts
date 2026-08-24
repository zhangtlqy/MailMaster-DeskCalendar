import { useCallback, useEffect, useRef, useState } from 'react';
import type { CalendarSettings, WindowGeometry } from '../types/calendar-settings.types';
import { DEFAULT_CALENDAR_SETTINGS, sanitizeCalendarSettings } from '../utils/calendarSettings';

const STORAGE_KEY = 'deskcalendar.settings.v1';

function loadSettings(): CalendarSettings {
  try {
    return sanitizeCalendarSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    return DEFAULT_CALENDAR_SETTINGS;
  }
}

export function useCalendarSettings() {
  const [settings, setSettingsState] = useState<CalendarSettings>(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const setSettings = useCallback((next: CalendarSettings) => {
    const sanitized = sanitizeCalendarSettings(next);
    setSettingsState(sanitized);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  }, []);
  const updateSettings = useCallback((patch: Partial<CalendarSettings>) => {
    setSettingsState((current) => {
      const next = sanitizeCalendarSettings({ ...current, ...patch });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow, LogicalPosition, LogicalSize }) => {
      if (disposed) return;
      const win = getCurrentWindow();
      const initial = settingsRef.current;
      if (initial.geometry) {
        await win.setPosition(new LogicalPosition(initial.geometry.x, initial.geometry.y));
        await win.setSize(new LogicalSize(initial.geometry.width, initial.geometry.height));
      }
      await win.setResizable(!initial.lockWindow);

      const saveGeometry = async () => {
        if (settingsRef.current.lockWindow) return;
        const [position, size, scale] = await Promise.all([win.outerPosition(), win.outerSize(), win.scaleFactor()]);
        const geometry: WindowGeometry = {
          x: Math.round(position.x / scale), y: Math.round(position.y / scale),
          width: Math.round(size.width / scale), height: Math.round(size.height / scale),
        };
        updateSettings({ geometry });
      };
      unlisteners.push(await win.onMoved(() => void saveGeometry()));
      unlisteners.push(await win.onResized(() => void saveGeometry()));
    }).catch(() => undefined);
    return () => { disposed = true; unlisteners.forEach((unlisten) => unlisten()); };
  }, [updateSettings]);

  useEffect(() => {
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setResizable(!settings.lockWindow))
      .catch(() => undefined);
  }, [settings.lockWindow]);

  return { settings, setSettings, updateSettings };
}
