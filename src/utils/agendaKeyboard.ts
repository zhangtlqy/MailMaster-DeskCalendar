/** Keyboard shortcuts for the day agenda panel. */
export type AgendaKeyAction = 'prev-day' | 'next-day' | 'prev-week' | 'next-week' | 'today' | 'close';

const AGENDA_ACTIONS: Readonly<Record<string, AgendaKeyAction>> = {
  ArrowLeft: 'prev-day',
  ArrowRight: 'next-day',
  ArrowUp: 'prev-week',
  ArrowDown: 'next-week',
  Home: 'today',
  Escape: 'close',
};

/** Maps a KeyboardEvent key to an agenda action, or null when unhandled. */
export function agendaKeyAction(key: string): AgendaKeyAction | null {
  return AGENDA_ACTIONS[key] ?? null;
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'number', 'tel', 'url', 'date', 'time', 'datetime-local']);

/** Skips shortcuts while typing or choosing in editable controls. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type);
  return false;
}

/** Shifts a local calendar date by whole days, normalizing to midnight. */
export function shiftDate(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
