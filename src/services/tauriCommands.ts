// ========== Tauri IPC command wrappers (Phase 2: invokeSafe) ==========

import type { CalendarEvent, CreateEventInput, MailMasterEvent, UpdateEventInput, TimeSlot, Result } from '../types';
import { invokeSafe, invokeOrThrow } from '../utils/invokeSafe';

export async function createEvent(input: CreateEventInput): Promise<CalendarEvent> {
  return invokeOrThrow<CalendarEvent>('create_event', { input });
}

export async function getEvent(id: string): Promise<Result<CalendarEvent | null>> {
  return invokeSafe<CalendarEvent | null>('get_event', { id });
}

export async function listEvents(startDate: number, endDate: number): Promise<Result<CalendarEvent[]>> {
  return invokeSafe<CalendarEvent[]>('list_events', { start_date: startDate, end_date: endDate });
}

export async function updateEvent(id: string, input: UpdateEventInput): Promise<CalendarEvent> {
  return invokeOrThrow<CalendarEvent>('update_event', { id, input });
}

export async function deleteEvent(id: string): Promise<void> {
  return invokeOrThrow<void>('delete_event', { id });
}

export async function getFreeSlots(date: number, durationMinutes: number): Promise<Result<TimeSlot[]>> {
  return invokeSafe<TimeSlot[]>('get_free_slots', { date, duration_minutes: durationMinutes });
}

/** Reads events from NetEase MailMaster. */
export async function listMailMasterEvents(
  startDate: number,
  endDate: number,
  databasePath?: string,
): Promise<Result<MailMasterEvent[]>> {
  return invokeSafe<MailMasterEvent[]>('list_mailmaster_events', {
    start_date: Math.floor(startDate / 1000),
    end_date: Math.floor(endDate / 1000),
    database_path: databasePath || null,
  });
}

export async function getDefaultMailMasterDatabasePath(): Promise<Result<string>> {
  return invokeSafe<string>('get_default_mailmaster_database_path');
}

export async function validateMailMasterDatabase(path: string): Promise<Result<string>> {
  return invokeSafe<string>('validate_mailmaster_database', { path });
}

export interface MailMasterDatabaseCheck {
  path: string;
  calendar_count: number;
  event_count: number;
}

export async function checkMailMasterDatabase(databasePath?: string): Promise<Result<MailMasterDatabaseCheck>> {
  return invokeSafe<MailMasterDatabaseCheck>('check_mailmaster_database', {
    database_path: databasePath || null,
  });
}

export async function setMailMasterTodoCompleted(
  eventId: number,
  completed: boolean,
  databasePath?: string,
): Promise<Result<boolean>> {
  return invokeSafe<boolean>('set_mailmaster_todo_completed', {
    event_id: eventId,
    completed,
    database_path: databasePath || null,
  });
}
