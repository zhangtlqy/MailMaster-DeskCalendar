//! Completion of one displayed occurrence, never a write to the series master.
use super::mailmaster_recurrence::expand;
use super::mailmaster_repo::{map_event, validate_database, EVENT_QUERY};
use crate::error::{AppError, AppResult};
use chrono::{DateTime, FixedOffset, Utc};
use rusqlite::{params, Connection, OpenFlags, TransactionBehavior};
use std::path::Path;
use std::time::Duration;

fn invalid(message: &str) -> AppError { AppError::InvalidToolArgs(message.into()) }

fn utc(value: i64) -> AppResult<String> {
    DateTime::<Utc>::from_timestamp(value, 0)
        .map(|date| date.format("%Y%m%dT%H%M%SZ").to_string())
        .ok_or_else(|| invalid("无效的日程时间"))
}

fn escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace("\r\n", "\n").replace('\r', "\n")
        .replace('\n', "\\n").replace(';', "\\;").replace(',', "\\,")
}

fn fold(value: &str) -> String {
    let mut out = String::new();
    let mut length = 0;
    for character in value.chars() {
        if length + character.len_utf8() > 75 { out.push_str("\r\n "); length = 1; }
        out.push(character); length += character.len_utf8();
    }
    out
}

fn date_property(name: &str, value: i64, all_day: bool) -> AppResult<String> {
    if all_day {
        let date = DateTime::<Utc>::from_timestamp(value, 0).ok_or_else(|| invalid("无效日期"))?;
        Ok(format!("{name};VALUE=DATE:{}", date.with_timezone(&FixedOffset::east_opt(8 * 3600).unwrap()).format("%Y%m%d")))
    } else { Ok(format!("{name}:{}", utc(value)?)) }
}

fn completion_raw(raw: &str, completed: bool, now: i64) -> AppResult<String> {
    let mut lines: Vec<String> = Vec::new();
    for line in raw.lines() {
        if line.starts_with([' ', '\t']) {
            if let Some(last) = lines.last_mut() { last.push_str(&line[1..]); }
        } else { lines.push(line.to_owned()); }
    }
    if lines.first().map(String::as_str) != Some("BEGIN:VTODO")
        || lines.last().map(String::as_str) != Some("END:VTODO") {
        return Err(invalid("待办原始格式无效，无法更新完成状态"));
    }
    let mut depth = 0;
    lines.retain(|line| {
        if line.starts_with("BEGIN:") { depth += 1; }
        let name = line.split([':', ';']).next().unwrap_or("");
        let keep = depth != 1 || !matches!(name, "STATUS" | "COMPLETED" | "PERCENT-COMPLETE" | "LAST-MODIFIED");
        if line.starts_with("END:") { depth -= 1; }
        keep
    });
    lines.pop();
    lines.push(format!("STATUS:{}", if completed { "COMPLETED" } else { "NEEDS-ACTION" }));
    lines.push(format!("LAST-MODIFIED:{}", utc(now)?));
    if completed { lines.push(format!("COMPLETED:{}", utc(now)?)); }
    lines.push(format!("PERCENT-COMPLETE:{}", if completed { 100 } else { 0 }));
    lines.push("END:VTODO".into());
    Ok(lines.iter().map(|line| fold(line)).collect::<Vec<_>>().join("\r\n") + "\r\n")
}

pub fn set_occurrence_completed(path: &Path, event_id: i64, start: i64, completed: bool) -> AppResult<bool> {
    validate_database(path)?;
    let end = start.checked_add(1).ok_or_else(|| invalid("无效的实例时间"))?;
    let mut connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    connection.busy_timeout(Duration::from_secs(10))?;
    let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let sources = tx.prepare(EVENT_QUERY)?.query_map([start, end], map_event)?
        .collect::<Result<Vec<_>, _>>()?;
    let source = sources.iter().find(|s| s.event.id == event_id && !s.deleted)
        .ok_or_else(|| invalid("日程已变化，请刷新后重试"))?;
    let uid = source.uid.clone();
    // A stale master ID can be retried after this occurrence was detached.
    let eligible: Vec<i64> = sources.iter().filter(|s| s.calendar_id == source.calendar_id &&
        (s.event.id == event_id || s.original_id == event_id || (!uid.is_empty() && (s.uid == uid ||
         (s.rrule.is_empty() && s.rdate.is_empty() && s.raw.lines().any(|line| line == format!("UID:{uid}")))))))
        .map(|s| s.event.id).collect();
    let event = expand(sources, start, end).into_iter()
        .find(|e| e.start_time == start && eligible.contains(&e.id))
        .ok_or_else(|| invalid("这次重复日程不存在或已取消，请刷新后重试"))?;
    if !event.is_todo { return Err(invalid("只有待办可以切换完成状态")); }
    let (dirty, attendee, raw, original_id, recurrence_id, rrule, rdate): (i64, i64, String, i64, i64, String, String) = tx.query_row(
        "SELECT Dirty,HasAttendee,COALESCE(Raw,''),COALESCE(OriginalID,0),COALESCE(RecurrenceID,0),COALESCE(RRule,''),COALESCE(RDate,'') FROM Events WHERE Id=?1", [event.id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)))?;
    if dirty != 0 || attendee != 0 { return Err(invalid("该日程有待同步修改或会议邀请，请先在邮箱大师处理")); }
    if event.is_completed == completed { tx.commit()?; return Ok(completed); }
    let now = Utc::now().timestamp();
    let raw_uid_matches = raw.lines().find_map(|line| line.strip_prefix("UID:"))
        .is_some_and(|raw_uid| raw_uid == uid);
    let create_exception = original_id == 0 && recurrence_id == 0 && (!rrule.is_empty() || !rdate.is_empty()
        || (raw_uid_matches && raw.lines().any(|line| line.starts_with("RRULE:") || line.starts_with("RDATE:"))));
    let updated_raw = if create_exception {
        if uid.is_empty() { return Err(invalid("重复待办缺少UID，无法保存本次状态")); }
        let lines = vec!["BEGIN:VTODO".into(), format!("UID:{}", escape(&uid)),
            format!("SUMMARY:{}", escape(&event.title)),
            format!("DESCRIPTION:{}", escape(event.description.as_deref().unwrap_or(""))),
            format!("LOCATION:{}", escape(event.location.as_deref().unwrap_or(""))),
            date_property("DTSTART", event.start_time, event.is_all_day)?,
            date_property("DUE", event.end_time, event.is_all_day)?,
            date_property("RECURRENCE-ID", event.start_time, event.is_all_day)?,
            format!("DTSTAMP:{}", utc(now)?), "END:VTODO".into()];
        completion_raw(&lines.join("\r\n"), completed, now)?
    } else if raw.is_empty() { raw } else { completion_raw(&raw, completed, now)? };
    // Backup via a separate read connection while holding the write reservation.
    let backup_dir = path.parent().ok_or_else(|| invalid("无效数据库路径"))?.join("DeskCalendarBackups");
    std::fs::create_dir_all(&backup_dir)?;
    let backup_path = backup_dir.join(format!("before-completion-{}.db", uuid::Uuid::now_v7()));
    let reader = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    reader.backup(rusqlite::DatabaseName::Main, &backup_path, None)?;
    if create_exception {
        tx.execute("INSERT INTO Events (CalendarId,Uid,Summary,Location,Description,Status,DTStart,DTEnd,
            LastKnownEnd,TimeStamp,RecurrenceID,OriginalID,AllDay,Dirty,Deleted,HasAlarm,HasAttendee,
            TimeZone,Raw,IsTodo,CompletedTime,RRule,RDate,ExRule,ExDate)
            SELECT CalendarId,Uid,Summary,Location,Description,?1,?2,?3,?3,?4,?2,Id,AllDay,0,0,0,0,
            TimeZone,?5,1,?6,'','','','' FROM Events WHERE Id=?7",
            params![if completed {5} else {4}, event.start_time, event.end_time, now, updated_raw,
                if completed {now} else {0}, event.id])?;
    } else {
        tx.execute("UPDATE Events SET Status=?1,CompletedTime=?2,Raw=?3 WHERE Id=?4 AND Deleted=0",
            params![if completed {5} else {4}, if completed {now} else {0}, updated_raw, event.id])?;
    }
    tx.commit()?;
    Ok(completed)
}

#[cfg(test)]
#[path = "mailmaster_completion_tests.rs"]
mod tests;
