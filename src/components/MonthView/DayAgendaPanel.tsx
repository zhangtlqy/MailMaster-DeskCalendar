import React from 'react';
import { PencilSimple, Plus, Trash, X } from '@phosphor-icons/react';
import type { MailMasterEvent } from '../../types';
import { formatAgendaEventTime, formatAgendaHeading, mailMasterEventKey } from '../../utils/dayAgenda';
import { TodoContextTarget } from './TodoContextTarget';

interface Props {
  date: Date;
  events: MailMasterEvent[];
  onClose: () => void;
  onToggleCompleted: (event: MailMasterEvent) => void;
  onCreate: () => void;
  onEdit: (event: MailMasterEvent) => void;
  onDelete: (event: MailMasterEvent) => void;
  onContextMenu: (event: MailMasterEvent, x: number, y: number) => void;
  pendingEventIds: ReadonlySet<number>;
}

export const DayAgendaPanel: React.FC<Props> = ({ date, events, onClose, onToggleCompleted, onCreate, onEdit, onDelete, onContextMenu, pendingEventIds }) => (
  <aside className="day-agenda" aria-label={`${formatAgendaHeading(date)}代办列表`}>
    <header className="day-agenda__header">
      <div><span>代办列表</span><h2>{formatAgendaHeading(date)}</h2></div>
      <div className="day-agenda__actions"><button onClick={onCreate} aria-label="新建待办" title="新建待办"><Plus /></button><button onClick={onClose} aria-label="关闭代办列表"
        title="方向键切换日期，Home 回到今天，Esc 关闭"><X /></button></div>
    </header>
    <div className="day-agenda__list">
      {events.length === 0 && <p className="day-agenda__empty">当日暂无代办</p>}
      {events.map((event) => <TodoContextTarget as="article" className={`day-agenda__event${event.is_completed ? ' is-completed' : ''}`}
        key={mailMasterEventKey(event)} event={event} onContextMenu={onContextMenu}>
        <span className="day-agenda__marker" style={{ backgroundColor: event.color }} />
        <div>
          <div className="day-agenda__title-row">
            {event.is_todo && <input
              type="checkbox"
              checked={event.is_completed}
              disabled={pendingEventIds.has(event.id)}
              title={event.is_recurring ? '仅修改本次完成状态' : undefined}
              onChange={() => onToggleCompleted(event)}
              aria-label={`${event.is_completed ? '标记为未完成' : '标记为已完成'}：${event.title}`}
              style={{ accentColor: event.color }}
            />}
            <h3>{event.title}</h3>
            {event.is_todo && <button className="day-agenda__edit" onClick={() => onEdit(event)} aria-label={`编辑待办：${event.title}`} title="编辑待办"><PencilSimple /></button>}
            {event.is_todo && <button className="day-agenda__delete" onClick={() => onDelete(event)} disabled={pendingEventIds.has(event.id)} aria-label={`删除待办：${event.title}`} title="删除待办"><Trash /></button>}
            <span className="day-agenda__calendar">{event.calendar_name}</span>
          </div>
          <time>{formatAgendaEventTime(event)}</time>
          {event.location && <p>{event.location}</p>}
          {event.description && <p className="day-agenda__description">{event.description}</p>}
        </div>
      </TodoContextTarget>)}
    </div>
  </aside>
);
