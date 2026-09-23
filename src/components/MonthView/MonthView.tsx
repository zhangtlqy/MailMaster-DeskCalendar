// ========== MailMaster month view ==========

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import zhCnLocale from '@fullcalendar/core/locales/zh-cn';
import type { DatesSetArg, EventClickArg, EventContentArg, MoreLinkMountArg } from '@fullcalendar/core';
import type { DateClickArg } from '@fullcalendar/interaction';
import { ArrowClockwise, CaretLeft, CaretRight, GearSix, Plus } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { MailMasterEvent } from '../../types';
import { useMailMasterEvents } from '../../hooks/useMailMasterEvents';
import { useCalendarSettings } from '../../hooks/useCalendarSettings';
import { useCalendarVisibility } from '../../hooks/useCalendarVisibility';
import { CalendarVisibilityPicker } from './CalendarVisibilityPicker';
import { displayWeekNumber, formatEventTime, formatMonthTitle, getCalendarVisibleRange, hexToRgba, weekdayHeaderLabel } from '../../utils/calendarSettings';
import type { CalendarSettings } from '../../types/calendar-settings.types';
import { CalendarSettingsPanel } from './CalendarSettingsPanel';
import { checkMailMasterDatabase, createMailMasterTodo, deleteMailMasterRecurringTodo, deleteMailMasterTodo, getDefaultMailMasterDatabasePath, setMailMasterTodoCompleted, updateMailMasterRecurringTodo, updateMailMasterTodo, validateMailMasterDatabase } from '../../services/tauriCommands';
import { DayAgendaPanel } from './DayAgendaPanel';
import { TodoDialog, type TodoDraft } from './TodoDialog';
import { TodoContextTarget } from './TodoContextTarget';
import { agendaKeyAction, isEditableTarget, shiftDate } from '../../utils/agendaKeyboard';
import { allDayDisplayRange, eventsForDate, mailMasterEventKey } from '../../utils/dayAgenda';
import './MonthView.css';

const CHINESE_CALENDAR_FORMATTER = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { day: 'numeric' });
const CALENDAR_PLUGINS = [dayGridPlugin, interactionPlugin];
const CALENDAR_VIEWS = { configurableWeeks: { type: 'dayGrid' } };
const MONTH_INCREMENT = { months: 1 };

type MonthEventProps = MailMasterEvent & { month_segment_continuation?: boolean };

function toFullCalendarEvents(event: MailMasterEvent) {
  const allDayRange = event.is_all_day ? allDayDisplayRange(event) : null;
  const originalStart = allDayRange?.start ?? new Date(event.start_time * 1000);
  const originalEnd = allDayRange?.end ?? new Date(event.end_time * 1000);
  const effectiveEnd = originalEnd > originalStart ? originalEnd : new Date(originalStart.getTime() + 1);
  const dayCursor = new Date(originalStart.getFullYear(), originalStart.getMonth(), originalStart.getDate());
  const segments = [];
  while (dayCursor < effectiveEnd && segments.length < 3700) {
    const nextDay = new Date(dayCursor.getFullYear(), dayCursor.getMonth(), dayCursor.getDate() + 1);
    const segmentStart = originalStart > dayCursor ? originalStart : new Date(dayCursor);
    const segmentEnd = effectiveEnd < nextDay ? effectiveEnd : nextDay;
    if (segmentEnd > segmentStart) {
      const continuation = segmentStart.getTime() !== originalStart.getTime();
      segments.push({
        id: `${mailMasterEventKey(event)}:${dayCursor.getTime()}`, title: event.title,
        start: segmentStart, end: segmentEnd,
        allDay: event.is_all_day,
        classNames: event.is_completed ? ['is-completed'] : [],
        extendedProps: { ...event, month_segment_continuation: continuation },
      });
    }
    dayCursor.setDate(dayCursor.getDate() + 1);
  }
  return segments;
}

function renderOverflowMarkers(arg: MoreLinkMountArg, events: MailMasterEvent[]) {
  const dateValue = arg.el.closest<HTMLElement>('[data-date]')?.dataset.date;
  if (!dateValue) return;

  const date = new Date(`${dateValue}T00:00:00`);
  const dayEvents = eventsForDate(events, date).sort((left, right) =>
    Number(left.is_completed) - Number(right.is_completed)
      || left.start_time - right.start_time
      || left.id - right.id);
  const hiddenEvents = dayEvents.slice(-arg.num);
  const dayFrame = arg.el.closest<HTMLElement>('.fc-daygrid-day-frame');
  const availableWidth = Math.max(24, (dayFrame?.clientWidth ?? arg.el.clientWidth) - 16);
  const dotPitch = 11;
  const ellipsisWidth = 16;
  const countTextWidth = 54;
  const allDotsFit = hiddenEvents.length * dotPitch + countTextWidth <= availableWidth;
  const dotCount = allDotsFit
    ? hiddenEvents.length
    : Math.max(0, Math.floor((availableWidth - countTextWidth - ellipsisWidth) / dotPitch));

  const markerHost = document.createElement('span');
  markerHost.className = 'month-overflow-markers';
  hiddenEvents.slice(0, dotCount).forEach((event) => {
    const dot = document.createElement('i');
    dot.className = 'month-overflow-markers__dot';
    dot.style.backgroundColor = event.color;
    markerHost.append(dot);
  });
  if (!allDotsFit) {
    const ellipsis = document.createElement('span');
    ellipsis.className = 'month-overflow-markers__ellipsis';
    ellipsis.textContent = '…';
    markerHost.append(ellipsis);
  }
  const countText = document.createElement('span');
  countText.className = 'month-overflow-markers__count';
  countText.textContent = `另外${hiddenEvents.length}个`;
  markerHost.append(countText);
  arg.el.replaceChildren(markerHost);
  const hiddenSummary = hiddenEvents.map((event) => {
    const time = event.is_all_day ? '全天' : formatEventTime(new Date(event.start_time * 1000));
    const notes = [event.description?.trim(), event.location?.trim()].filter(Boolean).join('\n');
    return `${time} ${event.title}${notes ? `\n备注：${notes}` : ''}`;
  }).join('\n\n');
  arg.el.setAttribute('aria-label', `另外${hiddenEvents.length}个\n${hiddenSummary}`);
  arg.el.title = hiddenSummary;
}

function renderEventContent(
  arg: EventContentArg,
  markerStyle: CalendarSettings['eventMarkerStyle'],
  onDoubleClick: (event: MailMasterEvent) => void,
  onContextMenu: (event: MailMasterEvent, x: number, y: number) => void,
): React.ReactNode {
  const event = arg.event.extendedProps as MonthEventProps;
  const hoverText = event.description?.trim()
    ? `${arg.event.title}\n${event.description.trim()}`
    : arg.event.title;
  return <TodoContextTarget
    className="month-event"
    event={event}
    onContextMenu={onContextMenu}
    title={hoverText}
    style={{ '--event-color': event.color } as React.CSSProperties}
    onDoubleClick={(mouseEvent) => {
      if (!event.is_todo) return;
      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      onDoubleClick(event);
    }}
  >
    <span className={`month-event__marker month-event__marker--${markerStyle}`} aria-hidden="true" />
    {!arg.event.allDay && !event.month_segment_continuation && <span className="month-event__time">{formatEventTime(arg.event.start)}</span>}
    <span className="month-event__title">{arg.event.title}</span>
  </TodoContextTarget>;
}

function lunarDay(date: Date): string {
  return CHINESE_CALENDAR_FORMATTER.format(date).replace(/日$/, '');
}

function isSameCalendarDay(left: Date | null, right: Date): boolean {
  return Boolean(left && left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth() && left.getDate() === right.getDate());
}

const MonthView: React.FC = () => {
  const calendarRef = useRef<FullCalendar>(null);
  const singleClickTimerRef = useRef<number | null>(null);
  const anchorDateRef = useRef(new Date());
  const [title, setTitle] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCalendars, setShowCalendars] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [databaseSuccess, setDatabaseSuccess] = useState<string | null>(null);
  const [autoStartError, setAutoStartError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingEventIds, setPendingEventIds] = useState<Set<number>>(() => new Set());
  const [todoDialog, setTodoDialog] = useState<{ date: Date; event?: MailMasterEvent; scope?: 'occurrence' | 'series' } | null>(null);
  const [recurringEditCandidate, setRecurringEditCandidate] = useState<MailMasterEvent | null>(null);
  const [recurringDeleteCandidate, setRecurringDeleteCandidate] = useState<MailMasterEvent | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<{ event: MailMasterEvent; scope?: 'occurrence' | 'series' } | null>(null);
  const [todoMenu, setTodoMenu] = useState<{ event: MailMasterEvent; x: number; y: number } | null>(null);
  const { settings, updateSettings } = useCalendarSettings();
  const { events: allEvents, calendars, error, isLoading, setVisibleRange, refresh } = useMailMasterEvents(settings.mailMasterDbPath);
  const { visibleEvents: events, selectedIds, select } = useCalendarVisibility(settings.mailMasterDbPath, calendars, allEvents);
  const closeCalendars = useCallback(() => setShowCalendars(false), []);
  const visibleRange = useCallback((anchor: Date) =>
    getCalendarVisibleRange(anchor, settings.visibleWeeks, settings.firstWeekOffset), [settings.visibleWeeks, settings.firstWeekOffset]);
  const handleDatesSet = useCallback((range: DatesSetArg) => {
    anchorDateRef.current = range.view.calendar.getDate();
    setTitle(formatMonthTitle(anchorDateRef.current));
    setVisibleRange(range);
  }, [setVisibleRange]);
  const calendarEvents = useMemo(() => events.flatMap(toFullCalendarEvents), [events]);
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
  // Keeps the day agenda under arrow-key control; Escape closes, Home returns to today.
  useEffect(() => {
    if (!selectedDate) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (isEditableTarget(event.target)) return;
      const action = agendaKeyAction(event.key);
      if (!action) return;
      event.preventDefault();
      if (action === 'close') {
        setSelectedDate(null);
        return;
      }
      const days = action === 'prev-day' ? -1 : action === 'next-day' ? 1
        : action === 'prev-week' ? -7 : action === 'next-week' ? 7 : 0;
      const next = shiftDate(action === 'today' ? new Date() : selectedDate, days);
      setSelectedDate(next);
      const view = calendarRef.current?.getApi().view;
      if (view && (next < view.currentStart || next >= view.currentEnd)) {
        calendarRef.current?.getApi().gotoDate(next);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDate]);
  const openDayAgenda = (date: Date) => {
    setSelectedDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
    setShowSettings(false);
    setShowCalendars(false);
  };
  const defaultCalendarId = useMemo(() => {
    const selected = calendars.find((calendar) => selectedIds.has(calendar.id));
    return selected?.id ?? calendars.find((calendar) => calendar.id === 5)?.id ?? calendars[0]?.id ?? 0;
  }, [calendars, selectedIds]);
  const saveTodo = async (draft: TodoDraft, event?: MailMasterEvent) => {
    const result = event?.is_recurring && todoDialog?.scope
      ? await updateMailMasterRecurringTodo(event.id, event.start_time, todoDialog.scope, draft, settings.mailMasterDbPath)
      : event ? await updateMailMasterTodo(event.id, draft, settings.mailMasterDbPath)
        : await createMailMasterTodo(draft, settings.mailMasterDbPath);
    if (!result.ok) throw new Error(result.error.message);
    setTodoDialog(null);
    await refresh();
  };
  const confirmDeleteTodo = async () => {
    if (!deleteCandidate || pendingEventIds.has(deleteCandidate.event.id)) return;
    const { event, scope } = deleteCandidate;
    setPendingEventIds((current) => new Set(current).add(event.id));
    setMutationError(null);
    const result = scope
      ? await deleteMailMasterRecurringTodo(event.id, event.start_time, scope, settings.mailMasterDbPath)
      : await deleteMailMasterTodo(event.id, settings.mailMasterDbPath);
    if (result.ok) {
      await refresh();
      setDeleteCandidate(null);
    }
    else setMutationError(`无法删除待办：${result.error.message}`);
    setPendingEventIds((current) => {
      const next = new Set(current);
      next.delete(event.id);
      return next;
    });
  };
  const openTodoMenu = (event: MailMasterEvent, x: number, y: number) => {
    setTodoMenu({ event, x: Math.max(8, Math.min(x, window.innerWidth - 200)), y: Math.max(8, Math.min(y, window.innerHeight - 150)) });
  };
  const beginEditTodo = (event: MailMasterEvent) => {
    if (event.is_recurring) setRecurringEditCandidate(event);
    else setTodoDialog({ date: new Date(event.start_time * 1000), event });
  };
  const beginDeleteTodo = (event: MailMasterEvent) => {
    if (event.is_recurring) setRecurringDeleteCandidate(event);
    else setDeleteCandidate({ event });
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
    const result = await setMailMasterTodoCompleted(event.id, !event.is_completed, settings.mailMasterDbPath, event.start_time);
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
        <button onClick={() => setTodoDialog({ date: selectedDate ?? anchorDateRef.current })} aria-label="新建待办" title={calendars.length ? '新建待办' : '日历尚未加载'} disabled={!calendars.length}><Plus /></button>
        <CalendarVisibilityPicker calendars={calendars} selectedIds={selectedIds} open={showCalendars} loading={isLoading}
          onSelect={select} onClose={closeCalendars} onToggle={() => {
            setShowSettings(false); setSelectedDate(null); setShowCalendars((value) => !value);
          }} />
        <button onClick={() => { setSelectedDate(null); setShowCalendars(false); setShowSettings((value) => !value); }} aria-label="打开显示设置" title="显示设置"><GearSix /></button>
        <button onClick={() => void refresh()} aria-label="刷新网易邮箱大师日历"
          title="刷新网易邮箱大师日历" disabled={isLoading} aria-busy={isLoading}>
          <ArrowClockwise className={isLoading ? 'is-spinning' : ''} />
        </button>
      </div>
    </header>
    {(error || mutationError) && <div className="month-error" role="alert">{mutationError || error}</div>}
    <section className="month-calendar" aria-label="网易邮箱大师月历">
      <FullCalendar key={`${settings.visibleWeeks}:${settings.firstWeekOffset}`} ref={calendarRef}
        plugins={CALENDAR_PLUGINS} initialDate={anchorDateRef.current}
        initialView="configurableWeeks" views={CALENDAR_VIEWS}
        locale={zhCnLocale} firstDay={1} fixedWeekCount={false}
        dayHeaderContent={(arg) => weekdayHeaderLabel(arg.date, settings.weekdayStyle)}
        visibleRange={visibleRange}
        dateIncrement={MONTH_INCREMENT} showNonCurrentDates headerToolbar={false} height="100%" expandRows dayMaxEvents
        moreLinkDidMount={(arg) => renderOverflowMarkers(arg, events)}
        moreLinkClick={(arg) => { openDayAgenda(arg.date); return arg.view.type; }}
        eventDisplay="block" editable={false} selectable={false} events={calendarEvents}
        eventOrder="is_completed,start" eventOrderStrict
        datesSet={handleDatesSet}
        dayCellClassNames={(arg) => isSameCalendarDay(selectedDate, arg.date) ? ['is-agenda-selected'] : []}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        dateClick={handleDateClick} eventClick={handleEventClick}
        eventContent={(arg) => renderEventContent(arg, settings.eventMarkerStyle, (event) => void toggleCompleted(event), openTodoMenu)}
        dayCellContent={(arg) => <span className="month-day-label">
          <strong>{arg.dayNumberText.replace('日', '')}</strong><small>{lunarDay(arg.date)}</small>
          {arg.date.getDay() === 1 && <em className="week-number-badge">第{displayWeekNumber(arg.date, settings.weekOneNaturalWeek)}周</em>}
        </span>} />
      {calendars.length > 0 && selectedIds.size === 0 && <div className="month-empty-hint" role="status">
        <p>未选择任何日历</p>
        <button onClick={() => select(calendars.map((calendar) => calendar.id))}>显示全部日历</button>
      </div>}
    </section>
    {selectedDate && <DayAgendaPanel date={selectedDate} events={selectedDateEvents}
      onClose={() => setSelectedDate(null)} onToggleCompleted={(event) => void toggleCompleted(event)}
      onCreate={() => setTodoDialog({ date: selectedDate })} onEdit={beginEditTodo}
      onDelete={beginDeleteTodo}
      onContextMenu={openTodoMenu}
      pendingEventIds={pendingEventIds} />}
    {todoDialog && <TodoDialog date={todoDialog.date} event={todoDialog.event} calendars={calendars}
      defaultCalendarId={defaultCalendarId} editScope={todoDialog.scope} onClose={() => setTodoDialog(null)} onSave={saveTodo} />}
    {recurringEditCandidate && <div className="todo-scope-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRecurringEditCandidate(null); }}>
      <section className="todo-scope-dialog" role="dialog" aria-modal="true" aria-labelledby="todo-scope-dialog-title">
        <h2 id="todo-scope-dialog-title">修改重复待办</h2>
        <p>“{recurringEditCandidate.title}”的修改范围：</p>
        <div><button type="button" onClick={() => { setTodoDialog({ date: new Date(recurringEditCandidate.start_time * 1000), event: recurringEditCandidate, scope: 'occurrence' }); setRecurringEditCandidate(null); }}>修改当日</button><button type="button" onClick={() => { setTodoDialog({ date: new Date(recurringEditCandidate.start_time * 1000), event: recurringEditCandidate, scope: 'series' }); setRecurringEditCandidate(null); }}>修改全部</button></div>
        <footer><button type="button" onClick={() => setRecurringEditCandidate(null)}>取消</button></footer>
      </section>
    </div>}
    {recurringDeleteCandidate && <div className="todo-scope-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRecurringDeleteCandidate(null); }}>
      <section className="todo-scope-dialog" role="dialog" aria-modal="true" aria-labelledby="todo-delete-scope-dialog-title">
        <h2 id="todo-delete-scope-dialog-title">删除重复待办</h2>
        <p>“{recurringDeleteCandidate.title}”的删除范围：</p>
        <div><button type="button" onClick={() => { setDeleteCandidate({ event: recurringDeleteCandidate, scope: 'occurrence' }); setRecurringDeleteCandidate(null); }}>删除当日</button><button className="todo-delete-dialog__danger" type="button" onClick={() => { setDeleteCandidate({ event: recurringDeleteCandidate, scope: 'series' }); setRecurringDeleteCandidate(null); }}>删除全部</button></div>
        <footer><button type="button" onClick={() => setRecurringDeleteCandidate(null)}>取消</button></footer>
      </section>
    </div>}
    {deleteCandidate && <div className="todo-delete-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pendingEventIds.has(deleteCandidate.event.id)) setDeleteCandidate(null); }}>
      <section className="todo-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="todo-delete-dialog-title">
        <h2 id="todo-delete-dialog-title">删除待办？</h2>
        <p>将{deleteCandidate.scope === 'series' ? '删除全部重复事项' : deleteCandidate.scope === 'occurrence' ? '仅删除当日事项' : '删除待办'}“{deleteCandidate.event.title}”。此操作会先备份本地日历数据库。</p>
        <footer><button type="button" disabled={pendingEventIds.has(deleteCandidate.event.id)} onClick={() => setDeleteCandidate(null)}>取消</button><button className="todo-delete-dialog__danger" type="button" disabled={pendingEventIds.has(deleteCandidate.event.id)} onClick={() => void confirmDeleteTodo()}>{pendingEventIds.has(deleteCandidate.event.id) ? '删除中…' : '确认删除'}</button></footer>
      </section>
    </div>}
    {todoMenu && <div className="todo-context-menu-backdrop" onMouseDown={() => setTodoMenu(null)} onContextMenu={(event) => { event.preventDefault(); setTodoMenu(null); }}>
      <div className="todo-context-menu" role="menu" aria-label={`待办操作：${todoMenu.event.title}`} style={{ left: todoMenu.x, top: todoMenu.y }} onMouseDown={(event) => event.stopPropagation()}>
        <button role="menuitem" onClick={() => { void toggleCompleted(todoMenu.event); setTodoMenu(null); }}>{todoMenu.event.is_completed ? '标为未完成' : '标为完成'}</button>
        <button role="menuitem" onClick={() => { beginEditTodo(todoMenu.event); setTodoMenu(null); }}>编辑待办</button>
        <button className="todo-context-menu__delete" role="menuitem" onClick={() => { beginDeleteTodo(todoMenu.event); setTodoMenu(null); }}>删除待办</button>
      </div>
    </div>}
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
