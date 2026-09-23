import { useEffect, useRef } from 'react';
import { CalendarBlank, X } from '@phosphor-icons/react';
import type { MailMasterCalendar } from '../../types';
import { groupCalendars } from '../../utils/calendarGroups';

interface Props {
  calendars: MailMasterCalendar[];
  selectedIds: ReadonlySet<number>;
  open: boolean;
  loading: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (ids: number[]) => void;
}

/** Toolbar popover for choosing which calendars appear in all calendar views. */
export function CalendarVisibilityPicker({ calendars, selectedIds, open, loading, onToggle, onClose, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !host.current?.contains(event.target)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    host.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, onClose]);

  return <div className="calendar-picker" ref={host}>
    <button ref={trigger} onClick={onToggle} title="选择显示的日历" aria-label="选择显示的日历"
      aria-expanded={open} aria-haspopup="dialog" aria-controls="calendar-visibility-panel">
      <CalendarBlank />
    </button>
    {open && <section id="calendar-visibility-panel" className="calendar-picker__panel" role="dialog" aria-label="显示的日历">
      <div className="calendar-picker__heading"><strong>显示的日历</strong>
        <button onClick={onClose} aria-label="关闭日历选择"><X /></button>
      </div>
      <div className="calendar-picker__summary">
        <span>已选 {calendars.filter((calendar) => selectedIds.has(calendar.id)).length} / {calendars.length}</span>
        <button onClick={() => onSelect(calendars.map((calendar) => calendar.id))}>全选</button>
        <button onClick={() => onSelect([])}>全不选</button>
      </div>
      <div className="calendar-picker__list">
        {groupCalendars(calendars).map((group) => <section key={group.id} className="calendar-picker__group" aria-label={group.label}>
          <h3><span>{group.label}</span><small>{group.calendars.length}</small></h3>
          {group.calendars.map((calendar) => <label key={calendar.id} className="calendar-picker__item">
          <input type="checkbox" checked={selectedIds.has(calendar.id)}
            onChange={(event) => {
              const next = new Set(selectedIds);
              if (event.target.checked) next.add(calendar.id); else next.delete(calendar.id);
              onSelect([...next]);
            }} aria-label={`${calendar.name}（日历 ${calendar.id}）`} />
          <i style={{ backgroundColor: calendar.color }} aria-hidden="true" />
          <span>{calendar.name}</span>
          {group.calendars.some((other) => other.id !== calendar.id && other.name === calendar.name)
            && <small>#{calendar.id}</small>}
        </label>)}
        </section>)}
        {calendars.length === 0 && <p>{loading ? '正在读取日历…' : '暂无可选择的日历'}</p>}
      </div>
    </section>}
  </div>;
}
