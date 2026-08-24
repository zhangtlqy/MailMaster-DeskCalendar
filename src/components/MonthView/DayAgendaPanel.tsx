import React from 'react';
import { X } from '@phosphor-icons/react';
import type { MailMasterEvent } from '../../types';
import { formatAgendaEventTime, formatAgendaHeading } from '../../utils/dayAgenda';

interface Props {
  date: Date;
  events: MailMasterEvent[];
  onClose: () => void;
}

export const DayAgendaPanel: React.FC<Props> = ({ date, events, onClose }) => (
  <aside className="day-agenda" aria-label={`${formatAgendaHeading(date)}全部事项`}>
    <header className="day-agenda__header">
      <div><span>当日事项</span><h2>{formatAgendaHeading(date)}</h2></div>
      <button onClick={onClose} aria-label="关闭当日事项" title="关闭"><X /></button>
    </header>
    <div className="day-agenda__list">
      {events.length === 0 && <p className="day-agenda__empty">当日暂无事项</p>}
      {events.map((event) => <article className={`day-agenda__event${event.is_completed ? ' is-completed' : ''}`} key={event.id}>
        <span className="day-agenda__marker" style={{ backgroundColor: event.color }} />
        <div>
          <div className="day-agenda__title-row">
            <h3>{event.title}</h3>
            <span className="day-agenda__calendar">{event.calendar_name}</span>
          </div>
          <time>{formatAgendaEventTime(event)}</time>
          {event.location && <p>{event.location}</p>}
        </div>
      </article>)}
    </div>
  </aside>
);
