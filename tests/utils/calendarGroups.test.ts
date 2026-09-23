import { describe, expect, it } from 'vitest';
import { groupCalendars } from '../../src/utils/calendarGroups';
import type { MailMasterCalendar } from '../../src/types';

const calendar = (id: number, account: string | null, email: string | null = null): MailMasterCalendar => ({
  id, account_id: account, account_email: email, name: '默认', visible: true, color: '#4C9AFF',
});

describe('calendar account groups', () => {
  it('puts the five unaffiliated calendars above email groups, regardless of input order', () => {
    const groups = groupCalendars([
      calendar(6, '1', 'first@example.com'),
      ...[1, 2, 3, 4, 5].map((id) => calendar(id, null)),
      calendar(9, '3', 'second@example.com'), calendar(7, '1', 'first@example.com'),
    ]);
    expect(groups.map((group) => group.label)).toEqual(['未关联邮箱', 'first@example.com', 'second@example.com']);
    expect(groups.map((group) => group.calendars.map((item) => item.id))).toEqual([[1, 2, 3, 4, 5], [6, 7], [9]]);
  });
  it('keeps an unresolved email account separate from unaffiliated calendars', () => {
    expect(groupCalendars([calendar(8, '10'), calendar(1, null)]).map((group) => group.label))
      .toEqual(['未关联邮箱', '邮箱账号 10']);
    expect(groupCalendars([])).toEqual([]);
  });
});
