import { describe, expect, it } from 'vitest';
import { agendaKeyAction, isEditableTarget, shiftDate } from '../../src/utils/agendaKeyboard';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, options?: { contentEditable?: boolean; type?: string }): HTMLElement {
  const node = document.createElement(tag);
  if (options?.contentEditable) Object.defineProperty(node, 'isContentEditable', { value: true });
  if (options?.type) node.setAttribute('type', options.type);
  return node;
}

describe('agendaKeyboard', () => {
  it('maps navigation keys to agenda actions', () => {
    expect(agendaKeyAction('ArrowLeft')).toBe('prev-day');
    expect(agendaKeyAction('ArrowRight')).toBe('next-day');
    expect(agendaKeyAction('ArrowUp')).toBe('prev-week');
    expect(agendaKeyAction('ArrowDown')).toBe('next-week');
    expect(agendaKeyAction('Home')).toBe('today');
    expect(agendaKeyAction('Escape')).toBe('close');
  });

  it('ignores keys without an agenda action', () => {
    expect(agendaKeyAction('Enter')).toBeNull();
    expect(agendaKeyAction('End')).toBeNull();
    expect(agendaKeyAction('a')).toBeNull();
  });

  it('skips shortcuts while typing in editable controls', () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(document)).toBe(false);
    expect(isEditableTarget(element('div'))).toBe(false);
    expect(isEditableTarget(element('button'))).toBe(false);
    expect(isEditableTarget(element('input', { type: 'checkbox' }))).toBe(false);
    expect(isEditableTarget(element('input', { type: 'text' }))).toBe(true);
    expect(isEditableTarget(element('input', { type: 'number' }))).toBe(true);
    expect(isEditableTarget(element('textarea'))).toBe(true);
    expect(isEditableTarget(element('select'))).toBe(true);
    expect(isEditableTarget(element('div', { contentEditable: true }))).toBe(true);
  });

  it('shifts dates across month and year boundaries', () => {
    expect(shiftDate(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 1));
    expect(shiftDate(new Date(2026, 2, 1), -1)).toEqual(new Date(2026, 1, 28));
    expect(shiftDate(new Date(2025, 11, 31), 1)).toEqual(new Date(2026, 0, 1));
  });

  it('shifts by a whole week and keeps midnight', () => {
    const moved = shiftDate(new Date(2026, 8, 7, 15, 45), 7);
    expect(moved).toEqual(new Date(2026, 8, 14));
  });
});
