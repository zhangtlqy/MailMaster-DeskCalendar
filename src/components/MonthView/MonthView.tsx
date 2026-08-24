// ========== MailMaster read-only month view ==========

import React, { useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import zhCnLocale from '@fullcalendar/core/locales/zh-cn';
import type { EventClickArg, EventContentArg } from '@fullcalendar/core';
import { ArrowClockwise, CaretLeft, CaretRight, X } from '@phosphor-icons/react';
import type { MailMasterEvent } from '../../types';
import { useMailMasterEvents } from '../../hooks/useMailMasterEvents';
import './MonthView.css';

const CHINESE_CALENDAR_FORMATTER = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { day: 'numeric' });

function toFullCalendarEvent(event: MailMasterEvent) {
  return {
    id: String(event.id), title: event.title,
    start: new Date(event.start_time * 1000), end: new Date(event.end_time * 1000),
    allDay: event.is_all_day, backgroundColor: event.color, borderColor: event.color,
    extendedProps: event,
  };
}

function renderEventContent(arg: EventContentArg): React.ReactNode {
  return <div className="month-event" title={arg.event.title}>
    {!arg.event.allDay && <span className="month-event__time">{arg.timeText}</span>}
    <span className="month-event__title">{arg.event.title}</span>
  </div>;
}

function lunarDay(date: Date): string {
  return CHINESE_CALENDAR_FORMATTER.format(date).replace(/日$/, '');
}

const MonthView: React.FC = () => {
  const calendarRef = useRef<FullCalendar>(null);
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<MailMasterEvent | null>(null);
  const { events, error, isLoading, setVisibleRange, refresh } = useMailMasterEvents();
  const calendarEvents = useMemo(() => events.map(toFullCalendarEvent), [events]);
  const navigate = (action: 'prev' | 'today' | 'next') => calendarRef.current?.getApi()[action]();
  const handleEventClick = (arg: EventClickArg) => setSelected(arg.event.extendedProps as MailMasterEvent);

  return <main className="month-shell">
    <header className="month-toolbar" data-tauri-drag-region>
      <h1>{title}</h1>
      <nav className="month-toolbar__navigation" aria-label="月份导航">
        <button onClick={() => navigate('prev')} aria-label="上个月" title="上个月"><CaretLeft /></button>
        <button onClick={() => navigate('today')} aria-label="回到今天" title="回到今天">今天</button>
        <button onClick={() => navigate('next')} aria-label="下个月" title="下个月"><CaretRight /></button>
      </nav>
      <button className="month-toolbar__refresh" onClick={() => void refresh()}
        aria-label="刷新网易邮箱大师日历" title="刷新网易邮箱大师日历" disabled={isLoading}>
        <ArrowClockwise className={isLoading ? 'is-spinning' : ''} />
      </button>
    </header>
    {error && <div className="month-error" role="alert">{error}</div>}
    <section className="month-calendar" aria-label="网易邮箱大师月历">
      <FullCalendar ref={calendarRef} plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth" locale={zhCnLocale} firstDay={1} fixedWeekCount
        showNonCurrentDates headerToolbar={false} height="100%" dayMaxEvents
        eventDisplay="block" editable={false} selectable={false} events={calendarEvents}
        datesSet={(range) => { setTitle(range.view.title); setVisibleRange(range); }}
        eventClick={handleEventClick} eventContent={renderEventContent}
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
  </main>;
};

export default MonthView;
