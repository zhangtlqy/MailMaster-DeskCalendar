import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TodoDialog } from '../../src/components/MonthView/TodoDialog';

const calendars = [{ id: 5, name: '学习', color: '#2563eb', visible: true }];

it('creates an all-day todo with description and an exclusive next-day end', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<TodoDialog date={new Date(2026, 8, 18)} calendars={calendars} defaultCalendarId={5} onClose={vi.fn()} onSave={save} />);
  fireEvent.change(screen.getByLabelText('标题'), { target: { value: '整理实验数据' } });
  fireEvent.click(screen.getByLabelText('全天'));
  fireEvent.change(screen.getByLabelText('描述'), { target: { value: '地点：实验室' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: '整理实验数据', calendar_id: 5, is_all_day: true, description: '地点：实验室', completed: false }), undefined);
  const submitted = save.mock.calls[0][0];
  expect(submitted.end_time - submitted.start_time).toBe(86_400);
});

it('opens an editable ordinary todo with its stored fields', () => {
  render(<TodoDialog date={new Date(2026, 8, 18)} calendars={calendars} defaultCalendarId={5} onClose={vi.fn()} onSave={vi.fn()}
    event={{ id: 30, calendar_id: 5, title: '报销发票', description: '地点：财务处', start_time: 1789686000, end_time: 1789689600, is_all_day: false, calendar_name: '学习', color: '#2563eb', is_todo: true, is_completed: true }} />);
  expect(screen.getByDisplayValue('报销发票')).toBeTruthy();
  expect(screen.getByDisplayValue('地点：财务处')).toBeTruthy();
  expect((screen.getByLabelText('已完成') as HTMLInputElement).checked).toBe(true);
});

it('creates a weekly todo with a finite repeat count and five-minute time steps', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<TodoDialog date={new Date(2026, 8, 21)} calendars={calendars} defaultCalendarId={5} onClose={vi.fn()} onSave={save} />);
  fireEvent.change(screen.getByLabelText('标题'), { target: { value: '组会' } });
  fireEvent.change(screen.getByLabelText('重复'), { target: { value: 'weekly' } });
  fireEvent.change(screen.getByDisplayValue('16'), { target: { value: '8' } });
  expect((screen.getAllByDisplayValue('00:00')[0] as HTMLInputElement).step).toBe('300');
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ repeat_frequency: 'weekly', repeat_count: 8 }), undefined));
});

it('labels a single-occurrence edit and keeps completion outside the edit form', () => {
  render(<TodoDialog date={new Date(2026, 8, 21)} calendars={calendars} defaultCalendarId={5} editScope="occurrence" onClose={vi.fn()} onSave={vi.fn()}
    event={{ id: 12, calendar_id: 5, instance_id: '12:1', is_recurring: true, title: '组会', description: '', start_time: 1789972200,
      end_time: 1789977600, is_all_day: false, calendar_name: '学习', color: '#2563eb', is_todo: true, is_completed: true }} />);
  expect(screen.getByText('重复待办 · 修改当日')).toBeTruthy();
  expect(screen.queryByLabelText('已完成')).toBeNull();
});

it('groups calendar choices by email with unaffiliated calendars first', () => {
  const groupedCalendars = [
    { id: 8, name: '工作', color: '#f00', visible: true, account_id: 'account-1', account_email: 'work@example.com' },
    { id: 5, name: '学习', color: '#00f', visible: true, account_id: null, account_email: null },
    { id: 9, name: '会议', color: '#0f0', visible: true, account_id: 'account-1', account_email: 'work@example.com' },
  ];
  const { container } = render(<TodoDialog date={new Date(2026, 8, 21)} calendars={groupedCalendars}
    defaultCalendarId={5} onClose={vi.fn()} onSave={vi.fn()} />);
  const groups = [...container.querySelectorAll('optgroup')];
  expect(groups.map((group) => group.label)).toEqual(['未关联邮箱', 'work@example.com']);
  expect(groups.map((group) => [...group.querySelectorAll('option')].map((option) => option.textContent)))
    .toEqual([['学习'], ['工作', '会议']]);
});
