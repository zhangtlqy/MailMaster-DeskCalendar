import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DayAgendaPanel } from '../../src/components/MonthView/DayAgendaPanel';
import { setMailMasterTodoCompleted } from '../../src/services/tauriCommands';
import type { MailMasterEvent } from '../../src/types';

const { invokeSafe } = vi.hoisted(() => ({ invokeSafe: vi.fn() }));
vi.mock('../../src/utils/invokeSafe', () => ({ invokeSafe, invokeOrThrow: vi.fn() }));
afterEach(cleanup);

it('allows checking a recurring occurrence and passes its exact Unix-second start', async () => {
  const event: MailMasterEvent = { id: 438, instance_id: '438:1789456800', is_recurring: true,
    title: '应用随机过程', start_time: 1789456800, end_time: 1789462200, is_all_day: false,
    calendar_name: '学习', color: '#123456', is_todo: true, is_completed: false };
  invokeSafe.mockResolvedValue({ ok: true, value: true });
  const toggle = vi.fn((item: MailMasterEvent) => setMailMasterTodoCompleted(item.id, true, undefined, item.start_time));
  const props = { date: new Date(2026, 8, 15), events: [event], onClose: vi.fn(), onToggleCompleted: toggle, onCreate: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onContextMenu: vi.fn() };
  const view = render(<DayAgendaPanel {...props} pendingEventIds={new Set()} />);
  const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
  expect(checkbox.disabled).toBe(false);
  fireEvent.click(checkbox);
  expect(toggle).toHaveBeenCalledWith(event);
  expect(invokeSafe).toHaveBeenCalledWith('set_mailmaster_todo_completed', {
    event_id: 438, completed: true, database_path: null, occurrence_start: 1789456800,
  });
  view.rerender(<DayAgendaPanel {...props} pendingEventIds={new Set([438])} />);
  expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
});

it('places delete next to edit for a normal todo', () => {
  const event: MailMasterEvent = { id: 7, title: '报销发票', start_time: 1789456800, end_time: 1789460400,
    is_all_day: false, calendar_name: '学习', color: '#123456', is_todo: true, is_completed: false };
  const remove = vi.fn();
  const openMenu = vi.fn();
  render(<DayAgendaPanel date={new Date(2026, 8, 15)} events={[event]} onClose={vi.fn()} onToggleCompleted={vi.fn()} onCreate={vi.fn()} onEdit={vi.fn()} onDelete={remove} onContextMenu={openMenu} pendingEventIds={new Set()} />);
  fireEvent.click(screen.getByRole('button', { name: '删除待办：报销发票' }));
  expect(remove).toHaveBeenCalledWith(event);
  fireEvent.contextMenu(screen.getByText('报销发票').closest('article')!, { clientX: 100, clientY: 200 });
  expect(openMenu).toHaveBeenCalledWith(event, 100, 200);
});
