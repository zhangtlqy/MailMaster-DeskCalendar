// ========== MailMaster read-only month view ==========

import React, { useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import zhCnLocale from '@fullcalendar/core/locales/zh-cn';
import type { EventClickArg, EventContentArg } from '@fullcalendar/core';
import { ArrowClockwise, CaretLeft, CaretRight, GearSix, X } from '@phosphor-icons/react';
import type { MailMasterEvent } from '../../types';
import { useMailMasterEvents } from '../../hooks/useMailMasterEvents';
import { useCalendarSettings } from '../../hooks/useCalendarSettings';
import { formatEventTime, formatMonthTitle, getCalendarVisibleRange, hexToRgba } from '../../utils/calendarSettings';
import type { CalendarSettings } from '../../types/calendar-settings.types';
import { CalendarSettingsPanel } from './CalendarSettingsPanel';
import './MonthView.css';

const CHINESE_CALENDAR_FORMATTER = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { day: 'numeric' });

function toFullCalendarEvent(event: MailMasterEvent) {
  return {
    id: String(event.id), title: event.title,
    start: new Date(event.start_time * 1000), end: new Date(event.end_time * 1000),
    allDay: event.is_all_day,
    extendedProps: event,
  };
}

function renderEventContent(arg: EventContentArg, markerStyle: CalendarSettings['eventMarkerStyle']): React.ReactNode {
  const event = arg.event.extendedProps as MailMasterEvent;
  return <div className="month-event" title={arg.event.title} style={{ '--event-color': event.color } as React.CSSProperties}>
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
  const anchorDateRef = useRef(new Date());
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<MailMasterEvent | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { settings, updateSettings } = useCalendarSettings();
  const { events, error, isLoading, setVisibleRange, refresh } = useMailMasterEvents();
  const calendarEvents = useMemo(() => events.map(toFullCalendarEvent), [events]);
  const navigate = (action: 'prev' | 'today' | 'next') => calendarRef.current?.getApi()[action]();
  const handleEventClick = (arg: EventClickArg) => setSelected(arg.event.extendedProps as MailMasterEvent);
  const surface = hexToRgba(settings.backgroundColor, settings.opacity);
  const subtleSurface = hexToRgba(settings.backgroundColor, Math.max(0.01, settings.opacity - 0.03));

  return <main className="month-shell" style={{
    '--calendar-surface': surface,
    '--calendar-subtle-surface': subtleSurface,
    '--calendar-title-color': settings.titleColor,
    '--calendar-title-size': `${settings.titleFontSize}px`,
    '--calendar-date-color': settings.dateColor,
    '--calendar-date-size': `${settings.dateFontSize}px`,
    '--calendar-cell-text-color': settings.cellTextColor,
    '--calendar-cell-text-size': `${settings.cellFontSize}px`,
  } as React.CSSProperties}>
    <header className="month-toolbar" data-tauri-drag-region={settings.lockWindow ? undefined : true}>
      <h1>{title}</h1>
      <nav className="month-toolbar__navigation" aria-label="月份导航">
        <button onClick={() => navigate('prev')} aria-label="上个月" title="上个月"><CaretLeft /></button>
        <button onClick={() => navigate('today')} aria-label="回到今天" title="回到今天">今天</button>
        <button onClick={() => navigate('next')} aria-label="下个月" title="下个月"><CaretRight /></button>
      </nav>
      <div className="month-toolbar__actions">
        <button onClick={() => setShowSettings((value) => !value)} aria-label="打开显示设置" title="显示设置"><GearSix /></button>
        <button onClick={() => void refresh()} aria-label="刷新网易邮箱大师日历"
          title="刷新网易邮箱大师日历" disabled={isLoading}>
          <ArrowClockwise className={isLoading ? 'is-spinning' : ''} />
        </button>
      </div>
    </header>
    {error && <div className="month-error" role="alert">{error}</div>}
    <section className="month-calendar" aria-label="网易邮箱大师月历">
      <FullCalendar key={`${settings.visibleWeeks}:${settings.firstWeekOffset}`} ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin]} initialDate={anchorDateRef.current}
        initialView="configurableWeeks" views={{ configurableWeeks: { type: 'dayGrid' } }}
        locale={zhCnLocale} firstDay={1} fixedWeekCount={false}
        visibleRange={(anchor) => getCalendarVisibleRange(anchor, settings.visibleWeeks, settings.firstWeekOffset)}
        dateIncrement={{ months: 1 }} showNonCurrentDates headerToolbar={false} height="100%" expandRows dayMaxEvents
        eventDisplay="block" editable={false} selectable={false} events={calendarEvents}
        datesSet={(range) => {
          anchorDateRef.current = range.view.calendar.getDate();
          setTitle(formatMonthTitle(anchorDateRef.current));
          setVisibleRange(range);
        }}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        eventClick={handleEventClick} eventContent={(arg) => renderEventContent(arg, settings.eventMarkerStyle)}
        dayCellContent={(arg) => <span className="month-day-label">
          <strong>{arg.dayNumberText.replace('日', '')}</strong><small>{lunarDay(arg.date)}</small>
        </span>} />
    </section>
    {selected && <aside className="event-detail" aria-label="日程详情">
      <button className="event-detail__close" onClick={() => setSelected(null)} aria-label="关闭详情" title="关闭详情"><X /></button>
      <span className="event-detail__calendar">{selected.calendar_name}</span>
      <h2>{selected.title}</h2>
      {selected.location && <p>{selected.location}</p>}
      {selected.description && <p>{selected.description}</p>}
    </aside>}
    {showSettings && <>
      <button className="settings-backdrop" onClick={() => setShowSettings(false)} aria-label="关闭设置" />
      <CalendarSettingsPanel settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
    </>}
  </main>;
};

export default MonthView;
