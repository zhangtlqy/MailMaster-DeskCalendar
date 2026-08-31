import { useCallback, useEffect, useRef, useState } from 'react';
import type { CalendarSettings, WindowGeometry } from '../types/calendar-settings.types';
import { DEFAULT_CALENDAR_SETTINGS, sanitizeCalendarSettings } from '../utils/calendarSettings';

const STORAGE_KEY = 'deskcalendar.settings.v1';
const MIN_VISIBLE_PHYSICAL_PX = 64;

async function ensureWindowIsOnScreen(): Promise<boolean> {
  const { availableMonitors, getCurrentWindow, PhysicalPosition, primaryMonitor } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  const [position, size, monitors] = await Promise.all([
    win.outerPosition(),
    win.outerSize(),
    availableMonitors(),
  ]);
  if (monitors.length === 0) {
    await win.center();
    return true;
  }

  const sufficientlyVisible = monitors.some((monitor) => {
    const left = Math.max(position.x, monitor.position.x);
    const top = Math.max(position.y, monitor.position.y);
    const right = Math.min(position.x + size.width, monitor.position.x + monitor.size.width);
    const bottom = Math.min(position.y + size.height, monitor.position.y + monitor.size.height);
    return right - left >= MIN_VISIBLE_PHYSICAL_PX && bottom - top >= MIN_VISIBLE_PHYSICAL_PX;
  });
  if (sufficientlyVisible) return false;

  const monitor = await primaryMonitor() ?? monitors[0];
  const x = monitor.position.x + Math.max(0, Math.round((monitor.size.width - size.width) / 2));
  const y = monitor.position.y + Math.max(0, Math.round((monitor.size.height - size.height) / 2));
  await win.setPosition(new PhysicalPosition(x, y));
  return true;
}

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
        await win.setSize(new LogicalSize(initial.geometry.width, initial.geometry.height));
        await win.setPosition(new LogicalPosition(initial.geometry.x, initial.geometry.y));
      }
      await win.setResizable(!initial.lockWindow);

      const saveGeometry = async (force = false) => {
        if (settingsRef.current.lockWindow && !force) return;
        const [position, size, scale] = await Promise.all([win.outerPosition(), win.outerSize(), win.scaleFactor()]);
        const geometry: WindowGeometry = {
          x: Math.round(position.x / scale), y: Math.round(position.y / scale),
          width: Math.round(size.width / scale), height: Math.round(size.height / scale),
        };
        updateSettings({ geometry });
      };
      unlisteners.push(await win.onMoved(() => void saveGeometry()));
      unlisteners.push(await win.onResized(() => void saveGeometry()));
      const { listen } = await import('@tauri-apps/api/event');
      const rescueAndSave = async () => {
        if (await ensureWindowIsOnScreen()) await saveGeometry(true);
      };
      unlisteners.push(await listen('ensure-window-visible', () => void rescueAndSave()));
      await rescueAndSave();
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
