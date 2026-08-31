// ========== MailMaster month view ==========

import React, { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import zhCnLocale from '@fullcalendar/core/locales/zh-cn';
import type { EventClickArg, EventContentArg } from '@fullcalendar/core';
import type { DateClickArg } from '@fullcalendar/interaction';
import { ArrowClockwise, CaretLeft, CaretRight, GearSix } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { MailMasterEvent } from '../../types';
import { useMailMasterEvents } from '../../hooks/useMailMasterEvents';
import { useCalendarSettings } from '../../hooks/useCalendarSettings';
import { displayWeekNumber, formatEventTime, formatMonthTitle, getCalendarVisibleRange, hexToRgba, weekdayHeaderLabel } from '../../utils/calendarSettings';
import type { CalendarSettings } from '../../types/calendar-settings.types';
import { CalendarSettingsPanel } from './CalendarSettingsPanel';
import { checkMailMasterDatabase, getDefaultMailMasterDatabasePath, setMailMasterTodoCompleted, validateMailMasterDatabase } from '../../services/tauriCommands';
import { DayAgendaPanel } from './DayAgendaPanel';
import { eventsForDate } from '../../utils/dayAgenda';
import './MonthView.css';

const CHINESE_CALENDAR_FORMATTER = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { day: 'numeric' });

function toFullCalendarEvent(event: MailMasterEvent) {
  return {
    id: String(event.id), title: event.title,
    start: new Date(event.start_time * 1000), end: new Date(event.end_time * 1000),
    allDay: event.is_all_day,
    classNames: event.is_completed ? ['is-completed'] : [],
    extendedProps: event,
  };
}

function renderEventContent(
  arg: EventContentArg,
  markerStyle: CalendarSettings['eventMarkerStyle'],
  onDoubleClick: (event: MailMasterEvent) => void,
): React.ReactNode {
  const event = arg.event.extendedProps as MailMasterEvent;
  return <div
    className="month-event"
    title={event.is_todo ? `${arg.event.title}（双击切换完成状态）` : arg.event.title}
    style={{ '--event-color': event.color } as React.CSSProperties}
    onDoubleClick={(mouseEvent) => {
      if (!event.is_todo) return;
      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      onDoubleClick(event);
    }}
  >
    <span className={`month-event__marker month-event__marker--${markerStyle}`} aria-hidden="true" />
    {!arg.event.allDay && <span className="month-event__time">{formatEventTime(arg.event.start)}</span>}
    <span className="month-event__title">{arg.event.title}</span>
  </div>;
}

function lunarDay(date: Date): string {
  return CHINESE_CALENDAR_FORMATTER.format(date).replace(/日$/, '');
}

const MonthView: React.FC = () => {
  const calendarRef = useRef<FullCalendar>(null);
  const singleClickTimerRef = useRef<number | null>(null);
  const anchorDateRef = useRef(new Date());
  const [title, setTitle] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [databaseSuccess, setDatabaseSuccess] = useState<string | null>(null);
  const [autoStartError, setAutoStartError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingEventIds, setPendingEventIds] = useState<Set<number>>(() => new Set());
  const { settings, updateSettings } = useCalendarSettings();
  const { events, error, isLoading, setVisibleRange, refresh } = useMailMasterEvents(settings.mailMasterDbPath);
  const calendarEvents = useMemo(() => events.map(toFullCalendarEvent), [events]);
  const selectedDateEvents = useMemo(
    () => selectedDate ? eventsForDate(events, selectedDate) : [],
    [events, selectedDate],
  );
  const navigate = (action: 'prev' | 'today' | 'next') => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (action === 'today') {
      api.gotoDate(new Date());
      return;
    }
    const current = api.getDate();
    api.gotoDate(new Date(current.getFullYear(), current.getMonth() + (action === 'next' ? 1 : -1), 1));
  };
  const openDayAgenda = (date: Date) => {
    setSelectedDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
    setShowSettings(false);
  };
  const handleEventClick = (arg: EventClickArg) => {
    if (arg.jsEvent.detail > 1) return;
    const date = (arg.jsEvent.target as Element | null)?.closest<HTMLElement>('.fc-daygrid-day')?.dataset.date;
    const fallback = arg.event.start;
    singleClickTimerRef.current = window.setTimeout(() => {
      if (date) {
        const [year, month, day] = date.split('-').map(Number);
        openDayAgenda(new Date(year, month - 1, day));
      } else if (fallback) {
        openDayAgenda(fallback);
      }
      singleClickTimerRef.current = null;
    }, 220);
  };
  const toggleCompleted = async (event: MailMasterEvent) => {
    if (!event.is_todo || pendingEventIds.has(event.id)) return;
    if (singleClickTimerRef.current !== null) {
      window.clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = null;
    }
    setPendingEventIds((current) => new Set(current).add(event.id));
    setMutationError(null);
    const result = await setMailMasterTodoCompleted(event.id, !event.is_completed, settings.mailMasterDbPath);
    if (result.ok) await refresh();
    else setMutationError(`无法修改待办状态：${result.error.message}`);
    setPendingEventIds((current) => {
      const next = new Set(current);
      next.delete(event.id);
      return next;
    });
  };
  const handleDateClick = (arg: DateClickArg) => openDayAgenda(arg.date);
  const surface = hexToRgba(settings.backgroundColor, settings.opacity);
  const subtleSurface = hexToRgba(settings.backgroundColor, Math.max(0.01, settings.opacity - 0.03));
  const useDatabasePath = async (path: string) => {
    const result = await validateMailMasterDatabase(path);
    if (result.ok) {
      updateSettings({ mailMasterDbPath: result.value });
      setDatabaseError(null);
      setDatabaseSuccess(null);
    } else {
      setDatabaseError(result.error.message);
    }
  };
  const browseDatabase = async () => {
    const selectedPath = await open({
      title: '选择网易邮箱大师 calendar.db',
      multiple: false,
      directory: false,
      filters: [{ name: '网易邮箱大师日历数据库', extensions: ['db', 'sqlite', 'sqlite3'] }],
    });
    if (typeof selectedPath === 'string') await useDatabasePath(selectedPath);
  };
  const autoDetectDatabase = async () => {
    const result = await getDefaultMailMasterDatabasePath();
    if (result.ok) await useDatabasePath(result.value);
    else setDatabaseError(result.error.message);
  };
  const checkDatabase = async () => {
    setDatabaseError(null);
    setDatabaseSuccess(null);
    const result = await checkMailMasterDatabase(settings.mailMasterDbPath);
    if (result.ok) {
      updateSettings({ mailMasterDbPath: result.value.path });
      setDatabaseSuccess(`读取成功：${result.value.calendar_count} 个日历，${result.value.event_count} 条事项`);
    } else {
      setDatabaseError(`读取失败：${result.error.message}`);
    }
  };
  const toggleAutoStart = async (enabled: boolean) => {
    try {
      const autostart = await import('@tauri-apps/plugin-autostart');
      if (enabled) await autostart.enable(); else await autostart.disable();
      const actual = await autostart.isEnabled();
      updateSettings({ autoStart: actual });
      await invoke('sync_tray_autostart', { enabled: actual });
      setAutoStartError(actual === enabled ? null : '系统返回的自启动状态与设置不一致');
    } catch (cause) {
      setAutoStartError(`无法修改开机自启动：${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  useEffect(() => {
    void import('@tauri-apps/plugin-autostart')
      .then(({ isEnabled }) => isEnabled())
      .then(async (enabled) => {
        updateSettings({ autoStart: enabled });
        await invoke('sync_tray_autostart', { enabled });
      })
      .catch(() => undefined);
  }, [updateSettings]);

  return <main className="month-shell" style={{
    '--calendar-surface': surface,
    '--calendar-subtle-surface': subtleSurface,
    '--calendar-title-color': settings.titleColor,
    '--calendar-title-size': `${settings.titleFontSize}px`,
    '--calendar-date-color': settings.dateColor,
    '--calendar-date-size': `${settings.dateFontSize}px`,
    '--calendar-lunar-color': settings.cellTextColor,
    '--calendar-lunar-size': `${settings.cellFontSize}px`,
    '--calendar-event-text-color': settings.eventTextColor,
  } as React.CSSProperties}>
    <header className="month-toolbar" data-tauri-drag-region={settings.lockWindow ? undefined : true}>
      <h1>{title}</h1>
      <nav className="month-toolbar__navigation" aria-label="月份导航">
        <button onClick={() => navigate('prev')} aria-label="上个月" title="上个月"><CaretLeft /></button>
        <button onClick={() => navigate('today')} aria-label="回到今天" title="回到今天">今天</button>
        <button onClick={() => navigate('next')} aria-label="下个月" title="下个月"><CaretRight /></button>
      </nav>
      <div className="month-toolbar__actions">
        <button onClick={() => { setSelectedDate(null); setShowSettings((value) => !value); }} aria-label="打开显示设置" title="显示设置"><GearSix /></button>
        <button onClick={() => void refresh()} aria-label="刷新网易邮箱大师日历"
          title="刷新网易邮箱大师日历" disabled={isLoading}>
          <ArrowClockwise className={isLoading ? 'is-spinning' : ''} />
        </button>
      </div>
    </header>
    {(error || mutationError) && <div className="month-error" role="alert">{mutationError || error}</div>}
    <section className="month-calendar" aria-label="网易邮箱大师月历">
      <FullCalendar key={`${settings.visibleWeeks}:${settings.firstWeekOffset}`} ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin]} initialDate={anchorDateRef.current}
        initialView="configurableWeeks" views={{ configurableWeeks: { type: 'dayGrid' } }}
        locale={zhCnLocale} firstDay={1} fixedWeekCount={false}
        dayHeaderContent={(arg) => weekdayHeaderLabel(arg.date, settings.weekdayStyle)}
        visibleRange={(anchor) => getCalendarVisibleRange(anchor, settings.visibleWeeks, settings.firstWeekOffset)}
        dateIncrement={{ months: 1 }} showNonCurrentDates headerToolbar={false} height="100%" expandRows dayMaxEvents
        eventDisplay="block" editable={false} selectable={false} events={calendarEvents}
        eventOrder="is_completed,start" eventOrderStrict
        datesSet={(range) => {
          anchorDateRef.current = range.view.calendar.getDate();
          setTitle(formatMonthTitle(anchorDateRef.current));
          setVisibleRange(range);
        }}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        dateClick={handleDateClick} eventClick={handleEventClick}
        eventContent={(arg) => renderEventContent(arg, settings.eventMarkerStyle, (event) => void toggleCompleted(event))}
        dayCellContent={(arg) => <span className="month-day-label">
          <strong>{arg.dayNumberText.replace('日', '')}</strong><small>{lunarDay(arg.date)}</small>
          {arg.date.getDay() === 1 && <em className="week-number-badge">第{displayWeekNumber(arg.date, settings.weekOneNaturalWeek)}周</em>}
        </span>} />
    </section>
    {selectedDate && <DayAgendaPanel date={selectedDate} events={selectedDateEvents}
      onClose={() => setSelectedDate(null)} onToggleCompleted={(event) => void toggleCompleted(event)}
      pendingEventIds={pendingEventIds} />}
    {showSettings && <>
      <button className="settings-backdrop" onClick={() => setShowSettings(false)} aria-label="关闭设置" />
      <CalendarSettingsPanel settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)}
        onBrowseDatabase={() => void browseDatabase()} onAutoDetectDatabase={() => void autoDetectDatabase()}
        databaseError={databaseError} databaseSuccess={databaseSuccess} onCheckDatabase={() => void checkDatabase()}
        onToggleAutoStart={(enabled) => void toggleAutoStart(enabled)}
        autoStartError={autoStartError} />
    </>}
  </main>;
};

export default MonthView;
