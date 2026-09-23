use super::*;

fn ts(text: &str) -> i64 {
    DateTime::parse_from_rfc3339(text).unwrap().timestamp()
}

fn meeting(rule: &str) -> SourceEvent {
    SourceEvent {
        event: MailMasterEvent {
            id: 325, calendar_id: 5, instance_id: "325:1788172200".into(), is_recurring: false,
            title: "组会".into(), start_time: ts("2026-08-31T18:30:00+08:00"),
            end_time: ts("2026-08-31T20:30:00+08:00"), is_all_day: false,
            calendar_name: "学习".into(), color: "#123456".into(), location: None,
            description: None, is_todo: true, is_completed: false,
        },
        calendar_id: 5, uid: "series-1".into(), rrule: rule.into(), rdate: String::new(),
        exdate: String::new(), exrule: String::new(), timezone: "Asia/Shanghai".into(),
        raw: "BEGIN:VTODO\r\nDTSTART;TZID=Asia/Shanghai:20260831T183000\r\nEND:VTODO\r\n".into(),
        original_id: 0, recurrence_id: 0, deleted: false,
    }
}

#[test]
fn august_31_meeting_appears_on_every_monday_and_stops_at_20() {
    let events = expand(vec![meeting("FREQ=WEEKLY;COUNT=20;BYDAY=MO")],
                        ts("2026-08-01T00:00:00+08:00"), ts("2027-03-01T00:00:00+08:00"));
    assert_eq!(events.len(), 20);
    assert_eq!(events[1].start_time, ts("2026-09-07T18:30:00+08:00"));
    assert_eq!(events[2].end_time, ts("2026-09-14T20:30:00+08:00"));
    assert_eq!(events.last().unwrap().start_time, ts("2027-01-11T18:30:00+08:00"));
    assert!(events.iter().all(|event| event.is_recurring && event.is_todo && event.id == 325));
    assert_eq!(events.iter().map(|event| &event.instance_id).collect::<HashSet<_>>().len(), 20);
}

#[test]
fn queries_after_first_occurrence_and_honors_exclusive_boundary() {
    let events = expand(vec![meeting("FREQ=WEEKLY;COUNT=20;BYDAY=MO")],
                        ts("2026-09-01T00:00:00+08:00"), ts("2026-09-28T18:30:00+08:00"));
    assert_eq!(events.len(), 3);
    assert_eq!(events[0].start_time, ts("2026-09-07T18:30:00+08:00"));
}

#[test]
fn respects_until_interval_exdate_and_extra_rdate() {
    let mut source = meeting("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;UNTIL=20261012T103000Z");
    source.exdate = "20260914T103000Z".into();
    source.rdate = "20260916T103000Z".into();
    let events = expand(vec![source], ts("2026-09-01T00:00:00+08:00"), ts("2026-11-01T00:00:00+08:00"));
    assert_eq!(events.iter().map(|event| event.start_time).collect::<Vec<_>>(), vec![
        ts("2026-09-16T18:30:00+08:00"), ts("2026-09-28T18:30:00+08:00"), ts("2026-10-12T18:30:00+08:00")]);
}

#[test]
fn moved_and_deleted_exceptions_replace_master_occurrences() {
    let master = meeting("FREQ=WEEKLY;COUNT=4;BYDAY=MO");
    let mut moved = meeting("");
    moved.event.id = 600;
    moved.original_id = 325;
    moved.recurrence_id = ts("2026-09-07T18:30:00+08:00");
    moved.event.start_time = ts("2026-09-08T19:00:00+08:00");
    moved.event.end_time = ts("2026-09-08T21:00:00+08:00");
    let mut deleted = meeting("");
    deleted.event.id = 601;
    deleted.original_id = 325;
    deleted.recurrence_id = ts("2026-09-14T18:30:00+08:00");
    deleted.deleted = true;
    let events = expand(vec![master, moved, deleted], ts("2026-09-01T00:00:00+08:00"), ts("2026-09-20T00:00:00+08:00"));
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].id, 600);
}

#[test]
fn raw_rules_are_unfolded_and_all_day_yearly_events_keep_dates() {
    let mut source = meeting("");
    source.event.is_all_day = true;
    source.event.start_time = ts("2003-09-16T00:00:00Z");
    source.event.end_time = source.event.start_time + 86_400;
    source.raw = "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20030916\r\nRRULE:FREQ=YEARLY;BYMONTH=9;\r\n BYMONTHDAY=16\r\nEND:VEVENT\r\n".into();
    let events = expand(vec![source], ts("2026-09-01T00:00:00+08:00"), ts("2026-10-01T00:00:00+08:00"));
    assert_eq!(events.len(), 1);
    assert_eq!(utc_date(events[0].start_time).unwrap().with_timezone(&Tz::Asia__Shanghai).format("%m-%d").to_string(), "09-16");
    assert_eq!(events[0].end_time - events[0].start_time, 86_400);
}

#[test]
fn monthly_last_weekday_and_daylight_saving_preserve_local_time() {
    let mut source = meeting("FREQ=MONTHLY;COUNT=3;BYDAY=-1MO");
    source.raw = "BEGIN:VEVENT\nDTSTART;TZID=America/New_York:20260831T183000\nEND:VEVENT\n".into();
    let events = expand(vec![source], ts("2026-09-01T01:00:00Z"), ts("2026-11-01T00:00:00Z"));
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].start_time, ts("2026-09-28T18:30:00-04:00"));
    let mut weekly = meeting("FREQ=WEEKLY;COUNT=12;BYDAY=MO");
    weekly.raw = "BEGIN:VEVENT\nDTSTART;TZID=America/New_York:20260831T183000\nEND:VEVENT\n".into();
    let events = expand(vec![weekly], ts("2026-11-01T00:00:00Z"), ts("2026-11-04T00:00:00Z"));
    assert_eq!(events[0].start_time, ts("2026-11-02T18:30:00-05:00"));
}

#[test]
fn midnight_point_todo_and_overnight_occurrence_are_included() {
    let mut source = meeting("FREQ=DAILY;COUNT=3");
    source.raw.clear();
    source.event.start_time = ts("2026-08-31T00:00:00+08:00");
    source.event.end_time = source.event.start_time;
    let events = expand(vec![source], ts("2026-09-01T00:00:00+08:00"), ts("2026-09-02T00:00:00+08:00"));
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].start_time, ts("2026-09-01T00:00:00+08:00"));
    let events = expand(vec![meeting("FREQ=WEEKLY;COUNT=20;BYDAY=MO")],
                        ts("2026-09-07T19:00:00+08:00"), ts("2026-09-07T21:00:00+08:00"));
    assert_eq!(events.len(), 1);
}

#[test]
fn completed_mailmaster_copies_replace_only_their_stored_occurrence() {
    let master = meeting("FREQ=WEEKLY;COUNT=4;BYDAY=MO");
    let mut first = meeting("");
    first.event.id = 600;
    first.uid = "completed-copy".into();
    first.event.is_completed = true;
    first.raw = "BEGIN:VTODO\nUID:series-1\nDTSTART;TZID=Asia/Shanghai:20260831T183000\nRRULE:FREQ=WEEKLY;COUNT=4;BYDAY=MO\nEND:VTODO\n".into();
    let mut later = meeting("");
    later.event.id = 601;
    later.uid = "later-copy".into();
    later.event.is_completed = true;
    later.event.start_time += 2 * 604800;
    later.event.end_time += 2 * 604800;
    later.raw = first.raw.clone();
    let mut unrelated = meeting("");
    unrelated.event.id = 602;
    unrelated.calendar_id = 6;
    unrelated.uid = "unrelated-copy".into();
    unrelated.event.is_completed = true;
    unrelated.raw = first.raw.clone();
    let events = expand(vec![master, first, later, unrelated], ts("2026-08-31T00:00:00+08:00"), ts("2026-09-28T00:00:00+08:00"));
    let series: Vec<_> = events.iter().filter(|event| event.id != 602).collect();
    assert_eq!(series.len(), 4);
    assert_eq!(series.iter().map(|event| event.is_completed).collect::<Vec<_>>(), vec![true, false, true, false]);
    assert_eq!(events.iter().filter(|event| event.id == 602).count(), 1);
}

#[test]
fn duplicate_completed_exceptions_render_as_one_occurrence() {
    let master = meeting("FREQ=WEEKLY;COUNT=4;BYDAY=MO");
    let mut first = meeting("");
    first.event.id = 600;
    first.event.is_completed = true;
    first.original_id = 325;
    first.recurrence_id = first.event.start_time;
    let mut duplicate = meeting("");
    duplicate.event.id = 601;
    duplicate.event.is_completed = true;
    duplicate.original_id = 325;
    duplicate.recurrence_id = duplicate.event.start_time;
    let events = expand(vec![master, first, duplicate],
        ts("2026-08-31T00:00:00+08:00"), ts("2026-09-28T00:00:00+08:00"));
    assert_eq!(events.len(), 4);
    assert_eq!(events[0].id, 601);
    assert!(events[0].is_completed);
}
