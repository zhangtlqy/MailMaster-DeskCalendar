import type { MailMasterCalendar } from '../types';

export interface CalendarGroup {
  id: string;
  label: string;
  calendars: MailMasterCalendar[];
}

/** Keep unaffiliated calendars first, then group by account identity, not calendar name. */
export function groupCalendars(calendars: MailMasterCalendar[]): CalendarGroup[] {
  const groups = new Map<string, CalendarGroup>();
  for (const calendar of calendars) {
    const accountId = calendar.account_id;
    const id = accountId ? `account:${accountId}` : 'unaffiliated';
    let group = groups.get(id);
    if (!group) {
      group = { id, label: accountId ? calendar.account_email || `邮箱账号 ${accountId}` : '未关联邮箱', calendars: [] };
      groups.set(id, group);
    }
    group.calendars.push(calendar);
  }
  const local = groups.get('unaffiliated');
  return [...(local ? [local] : []), ...[...groups.values()].filter((group) => group.id !== 'unaffiliated')];
}
