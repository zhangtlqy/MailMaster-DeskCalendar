import React, { useEffect, useRef, useState } from 'react';
import { Check, X } from '@phosphor-icons/react';
import type { MailMasterCalendar, MailMasterEvent } from '../../types';
import { groupCalendars } from '../../utils/calendarGroups';
import './TodoDialog.css';

export interface TodoDraft {
  calendar_id: number;
  title: string;
  description: string;
  start_time: number;
  end_time: number;
  is_all_day: boolean;
  completed: boolean;
  repeat_frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  repeat_count?: number;
}

interface Props {
  date: Date;
  calendars: MailMasterCalendar[];
  event?: MailMasterEvent | null;
  defaultCalendarId: number;
  editScope?: 'occurrence' | 'series';
  onClose: () => void;
  onSave: (draft: TodoDraft, event?: MailMasterEvent) => Promise<void>;
}

function localDate(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function localTime(value: Date) { return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`; }
function stamp(date: string, time: string) { return Math.floor(new Date(`${date}T${time}:00`).getTime() / 1000); }
function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }

export function TodoDialog({ date, calendars, event, defaultCalendarId, editScope, onClose, onSave }: Props) {
  const editing = Boolean(event);
  const initialStart = event ? new Date(event.start_time * 1000) : startOfDay(date);
  const initialEnd = event ? new Date(event.end_time * 1000) : new Date(initialStart.getTime() + 60 * 60 * 1000);
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [calendarId, setCalendarId] = useState(event?.calendar_id ?? defaultCalendarId);
  const [allDay, setAllDay] = useState(event?.is_all_day ?? false);
  const [completed, setCompleted] = useState(event?.is_completed ?? false);
  const [startDate, setStartDate] = useState(localDate(initialStart));
  const [endDate, setEndDate] = useState(localDate(initialEnd));
  const [startTime, setStartTime] = useState(event?.is_all_day ? '00:00' : localTime(initialStart));
  const [endTime, setEndTime] = useState(event?.is_all_day ? '00:00' : localTime(initialEnd));
  const [repeatFrequency, setRepeatFrequency] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('none');
  const [repeatCount, setRepeatCount] = useState(16);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const calendarGroups = groupCalendars(calendars);
  useEffect(() => { requestAnimationFrame(() => titleRef.current?.focus()); }, []);

  const setAllDayValue = (value: boolean) => {
    setAllDay(value);
    if (value) {
      setStartTime('00:00'); setEndTime('00:00');
      if (endDate <= startDate) setEndDate(localDate(new Date(new Date(`${startDate}T00:00:00`).getTime() + 86_400_000)));
    }
  };
  const submit = async (form: React.FormEvent) => {
    form.preventDefault();
    const start = stamp(startDate, allDay ? '00:00' : startTime);
    const end = stamp(endDate, allDay ? '00:00' : endTime);
    if (!title.trim()) { setError('请输入待办标题'); return; }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || (allDay && end <= start)) {
      setError(allDay ? '全天待办的结束日期必须晚于开始日期' : '结束时间不能早于开始时间'); return;
    }
    setSaving(true); setError('');
    try {
      await onSave({ calendar_id: calendarId, title: title.trim(), description, start_time: start, end_time: end, is_all_day: allDay, completed,
        repeat_frequency: repeatFrequency === 'none' ? undefined : repeatFrequency,
        repeat_count: repeatFrequency === 'none' ? undefined : repeatCount }, event ?? undefined);
    } catch (cause) { setSaving(false); setError(cause instanceof Error ? cause.message : '保存失败，请重试'); }
  };
  return <div className="todo-dialog-backdrop" onMouseDown={(item) => { if (item.target === item.currentTarget && !saving) onClose(); }}>
    <form className="todo-dialog" onSubmit={(item) => void submit(item)} aria-modal="true" role="dialog" aria-labelledby="todo-dialog-title">
      <header><div><span>{editScope === 'occurrence' ? '重复待办 · 修改当日' : editScope === 'series' ? '重复待办 · 修改全部' : '本地日历'}</span><h2 id="todo-dialog-title">{editing ? '编辑待办' : '新建待办'}</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="关闭"><X /></button></header>
      <label className="todo-dialog__field"><span>标题</span><input ref={titleRef} value={title} maxLength={500} onChange={(item) => setTitle(item.target.value)} /></label>
      <label className="todo-dialog__field"><span>日历</span><select value={calendarId} disabled={editing || saving} onChange={(item) => setCalendarId(Number(item.target.value))}>
        {calendarGroups.map((group) => <optgroup key={group.id} label={group.label}>
          {group.calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
        </optgroup>)}
      </select></label>
      <label className="todo-dialog__switch"><input type="checkbox" checked={allDay} disabled={saving} onChange={(item) => setAllDayValue(item.target.checked)} /><span>全天</span></label>
      <div className="todo-dialog__dates"><label><span>开始</span><input type="date" value={startDate} disabled={saving} onChange={(item) => { setStartDate(item.target.value); if (allDay && endDate <= item.target.value) setEndDate(localDate(new Date(new Date(`${item.target.value}T00:00:00`).getTime() + 86_400_000))); }} />{!allDay && <input type="time" step={300} value={startTime} disabled={saving} onChange={(item) => setStartTime(item.target.value)} />}</label><label><span>结束</span><input type="date" value={endDate} disabled={saving} onChange={(item) => setEndDate(item.target.value)} />{!allDay && <input type="time" step={300} value={endTime} disabled={saving} onChange={(item) => setEndTime(item.target.value)} />}</label></div>
      {!editing && <div className="todo-dialog__repeat"><label><span>重复</span><select value={repeatFrequency} disabled={saving} onChange={(item) => setRepeatFrequency(item.target.value as typeof repeatFrequency)}><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option><option value="yearly">每年</option></select></label>{repeatFrequency !== 'none' && <label><span>共</span><input type="number" min={2} max={999} step={1} value={repeatCount} disabled={saving} onChange={(item) => setRepeatCount(Number(item.target.value))} /><span>次</span></label>}</div>}
      <label className="todo-dialog__field"><span>描述</span><textarea value={description} maxLength={10_000} rows={4} disabled={saving} onChange={(item) => setDescription(item.target.value)} /></label>
      {editing && !event?.is_recurring && <label className="todo-dialog__switch"><input type="checkbox" checked={completed} disabled={saving} onChange={(item) => setCompleted(item.target.checked)} /><span>已完成</span></label>}
      {error && <p className="todo-dialog__error" role="alert">{error}</p>}
      <footer><button type="button" onClick={onClose} disabled={saving}>取消</button><button className="todo-dialog__primary" type="submit" disabled={saving}><Check />{saving ? '保存中…' : '保存'}</button></footer>
    </form>
  </div>;
}
