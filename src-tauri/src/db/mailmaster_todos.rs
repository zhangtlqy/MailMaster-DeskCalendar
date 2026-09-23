//! Local VTODO creation and edits for the desktop calendar.
use super::mailmaster_repo::validate_database;
use crate::error::{AppError, AppResult};
use chrono::{DateTime, Datelike, FixedOffset, Timelike, Utc};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use serde::Deserialize;
use std::path::Path;
use std::time::Duration;
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize)]
pub struct TodoInput {
    pub calendar_id: i64,
    pub title: String,
    pub description: String,
    pub start_time: i64,
    pub end_time: i64,
    pub is_all_day: bool,
    pub completed: bool,
    #[serde(default)]
    pub repeat_frequency: Option<String>,
    #[serde(default)]
    pub repeat_count: Option<u16>,
}

fn invalid(text: &str) -> AppError { AppError::InvalidToolArgs(text.into()) }
fn now() -> i64 { Utc::now().timestamp() }

fn checked_input(input: &TodoInput) -> AppResult<()> {
    if input.calendar_id <= 0 || input.title.trim().is_empty() || input.title.len() > 500 || input.description.len() > 10_000 {
        return Err(invalid("请填写标题，并检查标题或描述长度"));
    }
    let start = DateTime::<Utc>::from_timestamp(input.start_time, 0).ok_or_else(|| invalid("开始时间无效"))?;
    let end = DateTime::<Utc>::from_timestamp(input.end_time, 0).ok_or_else(|| invalid("结束时间无效"))?;
    if !(1970..=2100).contains(&start.year()) || !(1970..=2100).contains(&end.year()) || input.end_time < input.start_time {
        return Err(invalid("结束时间不能早于开始时间"));
    }
    if input.is_all_day {
        let zone = FixedOffset::east_opt(8 * 3600).unwrap();
        let s = start.with_timezone(&zone); let e = end.with_timezone(&zone);
        if input.end_time <= input.start_time || s.hour() != 0 || s.minute() != 0 || s.second() != 0 || e.hour() != 0 || e.minute() != 0 || e.second() != 0 {
            return Err(invalid("全天待办须从北京时间零点开始，并在结束日期零点结束"));
        }
    }
    Ok(())
}

fn recurrence_rule(input: &TodoInput) -> AppResult<Option<String>> {
    let frequency = input.repeat_frequency.as_deref().unwrap_or("none");
    let rrule_frequency = match frequency {
        "none" => {
            if input.repeat_count.is_some() { return Err(invalid("未设置重复时无需填写重复次数")); }
            return Ok(None);
        }
        "daily" => "DAILY",
        "weekly" => "WEEKLY",
        "monthly" => "MONTHLY",
        "yearly" => "YEARLY",
        _ => return Err(invalid("不支持的重复频率")),
    };
    let count = input.repeat_count.ok_or_else(|| invalid("请填写重复次数"))?;
    if !(2..=999).contains(&count) { return Err(invalid("重复次数须在 2 到 999 次之间")); }
    Ok(Some(format!("FREQ={rrule_frequency};COUNT={count}")))
}

fn escape(text: &str) -> String { text.replace('\\', "\\\\").replace("\r\n", "\n").replace('\r', "\n").replace('\n', "\\n").replace(';', "\\;").replace(',', "\\,") }
fn stamp(value: i64) -> AppResult<String> { DateTime::<Utc>::from_timestamp(value, 0).map(|v| v.format("%Y%m%dT%H%M%SZ").to_string()).ok_or_else(|| invalid("时间无效")) }
fn property(name: &str, value: i64, all_day: bool) -> AppResult<String> {
    if all_day { Ok(format!("{name};VALUE=DATE:{}", DateTime::<Utc>::from_timestamp(value, 0).ok_or_else(|| invalid("日期无效"))?.with_timezone(&FixedOffset::east_opt(8 * 3600).unwrap()).format("%Y%m%d"))) }
    else { Ok(format!("{name}:{}", stamp(value)?)) }
}
fn raw(uid: &str, input: &TodoInput, modified: i64, rrule: Option<&str>, recurrence_id: Option<i64>) -> AppResult<String> {
    let mut lines = vec!["BEGIN:VTODO".to_string(), format!("UID:{uid}"), format!("DTSTAMP:{}", stamp(modified)?),
        format!("LAST-MODIFIED:{}", stamp(modified)?), "SEQUENCE:0".to_string(), format!("SUMMARY:{}", escape(input.title.trim())),
        format!("DESCRIPTION:{}", escape(&input.description)), property("DTSTART", input.start_time, input.is_all_day)?,
        property("DUE", input.end_time, input.is_all_day)?, format!("STATUS:{}", if input.completed { "COMPLETED" } else { "NEEDS-ACTION" })];
    if let Some(value) = recurrence_id { lines.push(property("RECURRENCE-ID", value, input.is_all_day)?); }
    if let Some(rule) = rrule { lines.push(format!("RRULE:{rule}")); }
    if input.completed { lines.push(format!("COMPLETED:{}", stamp(modified)?)); lines.push("PERCENT-COMPLETE:100".into()); }
    lines.push("END:VTODO".into());
    Ok(lines.join("\r\n") + "\r\n")
}

fn backup(path: &Path) -> AppResult<()> {
    let folder = path.parent().ok_or_else(|| invalid("数据库路径无效"))?.join("DeskCalendarBackups");
    std::fs::create_dir_all(&folder)?;
    let destination = folder.join(format!("before-todo-edit-{}.db", Uuid::now_v7()));
    let source = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    source.backup(rusqlite::DatabaseName::Main, destination, None)?;
    Ok(())
}

fn open(path: &Path) -> AppResult<Connection> {
    validate_database(path)?;
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    connection.busy_timeout(Duration::from_secs(10))?;
    Ok(connection)
}

pub fn create_todo(path: &Path, input: TodoInput) -> AppResult<()> {
    checked_input(&input)?;
    let rrule = recurrence_rule(&input)?;
    let mut connection = open(path)?;
    let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let active: i64 = tx.query_row("SELECT COUNT(*) FROM Calendars WHERE Id=?1 AND Deleted=0", [input.calendar_id], |row| row.get(0))?;
    if active == 0 { return Err(invalid("所选日历不存在或不可用")); }
    let timestamp = now(); let uid = Uuid::now_v7().to_string(); let content = raw(&uid, &input, timestamp, rrule.as_deref(), None)?;
    backup(path)?;
    tx.execute("INSERT INTO Events (CalendarId,Uid,Summary,Location,Description,Status,DTStart,DTEnd,LastKnownEnd,TimeStamp,
        RecurrenceID,OriginalID,AllDay,TransparentType,Dirty,Deleted,HasAlarm,HasAttendee,TimeZone,Duration,RRule,RDate,ExRule,ExDate,Organizer,Raw,IsTodo,CompletedTime)
        VALUES (?1,?2,?3,'',?4,?5,?6,?7,?7,?8,0,0,?9,0,0,0,0,0,'Asia/Shanghai','',?10,'','','','',?11,1,?12)",
        params![input.calendar_id, uid, input.title.trim(), input.description, if input.completed {5} else {4}, input.start_time, input.end_time,
            timestamp, if input.is_all_day {1} else {0}, rrule.unwrap_or_default(), content, if input.completed {timestamp} else {0}])?;
    tx.commit()?;
    Ok(())
}

pub fn update_todo(path: &Path, event_id: i64, input: TodoInput) -> AppResult<()> {
    checked_input(&input)?;
    if recurrence_rule(&input)?.is_some() { return Err(invalid("请重新创建重复待办；已有待办不能直接改为重复待办")); }
    let mut connection = open(path)?;
    let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let (calendar_id, uid, is_todo, _dirty, _attendee, rrule, rdate, original, recurrence): (i64,String,i64,i64,i64,String,String,i64,i64) = tx.query_row(
        "SELECT CalendarId,COALESCE(Uid,''),IsTodo,Dirty,HasAttendee,COALESCE(RRule,''),COALESCE(RDate,''),COALESCE(OriginalID,0),COALESCE(RecurrenceID,0) FROM Events WHERE Id=?1 AND Deleted=0", [event_id],
        |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?,row.get(6)?,row.get(7)?,row.get(8)?)))?;
    if is_todo == 0 { return Err(invalid("只能编辑待办")); }
    if !rrule.is_empty() || !rdate.is_empty() || original != 0 || recurrence != 0 { return Err(invalid("重复待办仅支持修改本次完成状态")); }
    if calendar_id != input.calendar_id { return Err(invalid("暂不支持移动到其他日历")); }
    let timestamp=now(); let content=raw(&uid, &input, timestamp, None, None)?;
    backup(path)?;
    tx.execute("UPDATE Events SET Summary=?1,Description=?2,Location='',Status=?3,DTStart=?4,DTEnd=?5,LastKnownEnd=?5,TimeStamp=?6,AllDay=?7,TimeZone='Asia/Shanghai',Raw=?8,CompletedTime=?9 WHERE Id=?10",
      params![input.title.trim(),input.description,if input.completed {5} else {4},input.start_time,input.end_time,timestamp,if input.is_all_day {1} else {0},content,if input.completed {timestamp} else {0},event_id])?;
    tx.commit()?;
    Ok(())
}

pub fn update_recurring_todo(path: &Path, event_id: i64, occurrence_start: i64, scope: &str, input: TodoInput) -> AppResult<()> {
    checked_input(&input)?;
    if recurrence_rule(&input)?.is_some() { return Err(invalid("编辑重复待办时不能直接更换重复规则")); }
    if !matches!(scope, "occurrence" | "series") { return Err(invalid("请选择修改当日或修改全部")); }
    let mut connection = open(path)?;
    let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let (calendar_id, is_todo, _dirty, _attendee, original_id, selected_uid, selected_rrule, selected_raw): (i64, i64, i64, i64, i64, String, String, String) = tx.query_row(
        "SELECT CalendarId,COALESCE(IsTodo,0),COALESCE(Dirty,0),COALESCE(HasAttendee,0),COALESCE(OriginalID,0),COALESCE(Uid,''),COALESCE(RRule,''),COALESCE(Raw,'') FROM Events WHERE Id=?1 AND Deleted=0", [event_id],
        |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?,row.get(6)?,row.get(7)?)))?;
    if is_todo == 0 { return Err(invalid("只能编辑待办")); }
    if calendar_id != input.calendar_id { return Err(invalid("暂不支持移动到其他日历")); }
    let raw_uid = selected_raw.lines().find_map(|line| line.strip_prefix("UID:")).unwrap_or("");
    let master_id = if original_id != 0 { original_id } else if selected_rrule.is_empty() && !raw_uid.is_empty() && raw_uid != selected_uid {
        tx.query_row("SELECT Id FROM Events WHERE CalendarId=?1 AND Uid=?2 AND Deleted=0 AND COALESCE(RRule,'')<>'' ORDER BY Id LIMIT 1",
            params![calendar_id, raw_uid], |row| row.get(0))?
    } else { event_id };
    let (uid, master_status, master_completed, master_start, rrule, rdate, exrule, exdate): (String,i64,i64,i64,String,String,String,String) = tx.query_row(
        "SELECT COALESCE(Uid,''),COALESCE(Status,4),COALESCE(CompletedTime,0),DTStart,COALESCE(RRule,''),COALESCE(RDate,''),COALESCE(ExRule,''),COALESCE(ExDate,'') FROM Events WHERE Id=?1 AND Deleted=0 AND IsTodo<>0",
        [master_id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?,row.get(6)?,row.get(7)?)))?;
    if rrule.is_empty() || !rdate.is_empty() || !exrule.is_empty() {
        return Err(invalid("该重复规则包含额外日期或例外，请在邮箱大师中修改"));
    }
    let timestamp = now();
    backup(path)?;
    if scope == "occurrence" {
        let target_id = if event_id != master_id { Some(event_id) } else {
            tx.query_row("SELECT Id FROM Events WHERE OriginalID=?1 AND RecurrenceID=?2 AND Deleted=0 ORDER BY Id DESC LIMIT 1",
                params![master_id, occurrence_start], |row| row.get(0)).optional()?
        };
        let content = raw(&uid, &input, timestamp, None, Some(occurrence_start))?;
        if let Some(id) = target_id {
            tx.execute("UPDATE Events SET Summary=?1,Location='',Description=?2,Status=?3,DTStart=?4,DTEnd=?5,LastKnownEnd=?5,TimeStamp=?6,
                RecurrenceID=?7,OriginalID=?8,AllDay=?9,Raw=?10,CompletedTime=?11 WHERE Id=?12",
                params![input.title.trim(),input.description,if input.completed {5} else {4},input.start_time,input.end_time,timestamp,
                    occurrence_start,master_id,if input.is_all_day {1} else {0},content,if input.completed {timestamp} else {0},id])?;
        } else {
            tx.execute("INSERT INTO Events (CalendarId,Uid,Summary,Location,Description,Status,DTStart,DTEnd,LastKnownEnd,TimeStamp,
                RecurrenceID,OriginalID,AllDay,TransparentType,Dirty,Deleted,HasAlarm,HasAttendee,TimeZone,Duration,RRule,RDate,ExRule,ExDate,Organizer,Raw,IsTodo,CompletedTime)
                VALUES (?1,?2,?3,'',?4,?5,?6,?7,?7,?8,?9,?10,?11,0,0,0,0,0,'Asia/Shanghai','','','','','','',?12,1,?13)",
                params![calendar_id,uid,input.title.trim(),input.description,if input.completed {5} else {4},input.start_time,input.end_time,
                    timestamp,occurrence_start,master_id,if input.is_all_day {1} else {0},content,if input.completed {timestamp} else {0}])?;
        }
    } else {
        let delta = input.start_time.checked_sub(occurrence_start).ok_or_else(|| invalid("时间偏移无效"))?;
        let duration = input.end_time.checked_sub(input.start_time).ok_or_else(|| invalid("时长无效"))?;
        let new_master_start = master_start.checked_add(delta).ok_or_else(|| invalid("时间偏移无效"))?;
        let new_master_end = new_master_start.checked_add(duration).ok_or_else(|| invalid("时长无效"))?;
        let mut master_input = input.clone();
        master_input.start_time = new_master_start; master_input.end_time = new_master_end;
        master_input.completed = master_status == 5 || master_completed > 0;
        let mut master_raw = raw(&uid, &master_input, timestamp, Some(&rrule), None)?;
        if !exdate.is_empty() {
            master_raw = master_raw.replace("\r\nEND:VTODO", &format!("\r\nEXDATE:{exdate}\r\nEND:VTODO"));
        }
        tx.execute("UPDATE Events SET Summary=?1,Location='',Description=?2,DTStart=?3,DTEnd=?4,LastKnownEnd=?4,TimeStamp=?5,AllDay=?6,Raw=?7 WHERE Id=?8",
            params![input.title.trim(),input.description,new_master_start,new_master_end,timestamp,if input.is_all_day {1} else {0},master_raw,master_id])?;
        let exceptions = {
            let mut statement = tx.prepare("SELECT Id,Status,COALESCE(CompletedTime,0),DTStart,COALESCE(RecurrenceID,0) FROM Events
                WHERE Deleted=0 AND (OriginalID=?1 OR (CalendarId=?2 AND Id<>?1 AND COALESCE(RRule,'')='' AND Raw LIKE ?3))")?;
            let uid_pattern = format!("%UID:{uid}%");
            let rows = statement.query_map(params![master_id,calendar_id,uid_pattern], |row| Ok((row.get::<_,i64>(0)?,row.get::<_,i64>(1)?,row.get::<_,i64>(2)?,row.get::<_,i64>(3)?,row.get::<_,i64>(4)?)))?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        for (id, status, completed_time, old_start, old_recurrence) in exceptions {
            let mut exception_input = input.clone();
            exception_input.start_time = old_start.checked_add(delta).ok_or_else(|| invalid("例外时间偏移无效"))?;
            exception_input.end_time = exception_input.start_time.checked_add(duration).ok_or_else(|| invalid("例外时长无效"))?;
            exception_input.completed = status == 5 || completed_time > 0;
            let recurrence = (if old_recurrence == 0 { old_start } else { old_recurrence })
                .checked_add(delta).ok_or_else(|| invalid("例外时间偏移无效"))?;
            let content = raw(&uid, &exception_input, timestamp, None, Some(recurrence))?;
            tx.execute("UPDATE Events SET Summary=?1,Location='',Description=?2,DTStart=?3,DTEnd=?4,LastKnownEnd=?4,TimeStamp=?5,
                RecurrenceID=?6,OriginalID=?7,AllDay=?8,Raw=?9,RRule='',RDate='' WHERE Id=?10", params![input.title.trim(),input.description,exception_input.start_time,
                exception_input.end_time,timestamp,recurrence,master_id,if input.is_all_day {1} else {0},content,id])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Soft-delete a simple VTODO. MailMaster excludes records marked Deleted=1.
pub fn delete_todo(path: &Path, event_id: i64) -> AppResult<()> {
    if event_id <= 0 { return Err(invalid("待办编号无效")); }
    let mut connection = open(path)?;
    let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let (is_todo, _dirty, _attendee, rrule, rdate, original, recurrence): (i64, i64, i64, String, String, i64, i64) = tx.query_row(
        "SELECT IsTodo,Dirty,HasAttendee,COALESCE(RRule,''),COALESCE(RDate,''),COALESCE(OriginalID,0),COALESCE(RecurrenceID,0) FROM Events WHERE Id=?1 AND Deleted=0", [event_id],
        |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?,row.get(6)?)))?;
    if is_todo == 0 { return Err(invalid("只能删除待办")); }
    if !rrule.is_empty() || !rdate.is_empty() || original != 0 || recurrence != 0 { return Err(invalid("重复待办请在邮箱大师中删除")); }
    backup(path)?;
    tx.execute("UPDATE Events SET Deleted=1,TimeStamp=?1 WHERE Id=?2", params![now(), event_id])?;
    tx.commit()?;
    Ok(())
}

/// Deletes one generated occurrence or the complete recurring VTODO series.
/// A deleted occurrence remains as a tombstone exception so expansion does not recreate it.
pub fn delete_recurring_todo(path: &Path, event_id: i64, occurrence_start: i64, scope: &str) -> AppResult<()> {
    if event_id <= 0 || occurrence_start <= 0 { return Err(invalid("待办编号或日期无效")); }
    if !matches!(scope, "occurrence" | "series") { return Err(invalid("请选择删除当日或删除全部")); }
    let mut connection = open(path)?;
    let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let (calendar_id, is_todo, _dirty, _attendee, original_id, uid, rrule, raw_value): (i64,i64,i64,i64,i64,String,String,String) = tx.query_row(
        "SELECT CalendarId,COALESCE(IsTodo,0),COALESCE(Dirty,0),COALESCE(HasAttendee,0),COALESCE(OriginalID,0),COALESCE(Uid,''),COALESCE(RRule,''),COALESCE(Raw,'') FROM Events WHERE Id=?1 AND Deleted=0",
        [event_id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?,row.get(6)?,row.get(7)?)))?;
    if is_todo == 0 { return Err(invalid("只能删除待办")); }
    let raw_uid = raw_value.lines().find_map(|line| line.strip_prefix("UID:")).unwrap_or("");
    let master_id = if original_id != 0 { original_id } else if rrule.is_empty() && !raw_uid.is_empty() && raw_uid != uid {
        tx.query_row("SELECT Id FROM Events WHERE CalendarId=?1 AND Uid=?2 AND Deleted=0 AND COALESCE(RRule,'')<>'' ORDER BY Id LIMIT 1",
            params![calendar_id, raw_uid], |row| row.get(0))?
    } else { event_id };
    let master_uid: String = tx.query_row("SELECT COALESCE(Uid,'') FROM Events WHERE Id=?1 AND Deleted=0 AND IsTodo<>0 AND COALESCE(RRule,'')<>''",
        [master_id], |row| row.get(0))?;
    backup(path)?;
    let timestamp = now();
    if scope == "series" {
        let uid_pattern = format!("%UID:{master_uid}%");
        tx.execute("UPDATE Events SET Deleted=1,TimeStamp=?1 WHERE Id=?2 OR OriginalID=?2 OR (CalendarId=?3 AND Id<>?2 AND COALESCE(RRule,'')='' AND Raw LIKE ?4)",
            params![timestamp,master_id,calendar_id,uid_pattern])?;
    } else if event_id != master_id {
        tx.execute("UPDATE Events SET Deleted=1,TimeStamp=?1,OriginalID=?2,RecurrenceID=?3 WHERE Id=?4",
            params![timestamp,master_id,occurrence_start,event_id])?;
    } else {
        let existing: Option<i64> = tx.query_row("SELECT Id FROM Events WHERE OriginalID=?1 AND RecurrenceID=?2 ORDER BY Id DESC LIMIT 1",
            params![master_id,occurrence_start], |row| row.get(0)).optional()?;
        if let Some(id) = existing {
            tx.execute("UPDATE Events SET Deleted=1,TimeStamp=?1 WHERE Id=?2", params![timestamp,id])?;
        } else {
            tx.execute("INSERT INTO Events (CalendarId,Uid,Summary,Location,Description,Status,DTStart,DTEnd,LastKnownEnd,TimeStamp,
                RecurrenceID,OriginalID,AllDay,TransparentType,Dirty,Deleted,HasAlarm,HasAttendee,TimeZone,Duration,RRule,RDate,ExRule,ExDate,Organizer,Raw,IsTodo,CompletedTime)
                SELECT CalendarId,Uid,Summary,Location,Description,Status,?1,?1,?1,?2,?1,Id,AllDay,TransparentType,0,1,0,0,TimeZone,'','','','','','',Raw,1,0
                FROM Events WHERE Id=?3", params![occurrence_start,timestamp,master_id])?;
        }
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (std::path::PathBuf, std::path::PathBuf) {
        let folder = std::env::temp_dir().join(format!("deskcalendar-todo-{}", Uuid::now_v7()));
        std::fs::create_dir(&folder).unwrap(); let path=folder.join("calendar.db");
        let conn=Connection::open(&path).unwrap();
        conn.execute_batch("CREATE TABLE Calendars(Id INTEGER PRIMARY KEY,Deleted INTEGER); INSERT INTO Calendars VALUES(5,0);
          CREATE TABLE Events(Id INTEGER PRIMARY KEY,CalendarId INTEGER,Uid TEXT,Summary TEXT,Location TEXT,Description TEXT,Status INTEGER,DTStart INTEGER,DTEnd INTEGER,LastKnownEnd INTEGER,TimeStamp INTEGER,RecurrenceID INTEGER,OriginalID INTEGER,AllDay INTEGER,TransparentType INTEGER,Dirty INTEGER,Deleted INTEGER,HasAlarm INTEGER,HasAttendee INTEGER,TimeZone TEXT,Duration TEXT,RRule TEXT,RDate TEXT,ExRule TEXT,ExDate TEXT,Organizer TEXT,Raw TEXT,IsTodo INTEGER,CompletedTime INTEGER);").unwrap();
        (folder,path)
    }
    fn input() -> TodoInput { TodoInput { calendar_id:5,title:"整理数据".into(),description:"地点：实验室".into(),start_time:1789456800,end_time:1789460400,is_all_day:false,completed:false,repeat_frequency:None,repeat_count:None } }
    #[test]
    fn creates_and_updates_a_simple_vtodo_with_backups() {
        let (folder,path)=fixture(); let mut value=input();
        create_todo(&path,value.clone()).unwrap();
        let conn=Connection::open(&path).unwrap();
        let (id,raw):(i64,String)=conn.query_row("SELECT Id,Raw FROM Events",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
        assert!(raw.contains("BEGIN:VTODO") && raw.contains("DESCRIPTION:地点：实验室") && !raw.contains("LOCATION:"));
        drop(conn); value.title="已修改".into(); value.completed=true;
        update_todo(&path,id,value).unwrap();
        let conn=Connection::open(&path).unwrap();
        assert_eq!(conn.query_row("SELECT Summary FROM Events WHERE Id=?",[id],|r|r.get::<_,String>(0)).unwrap(),"已修改");
        assert_eq!(conn.query_row("SELECT Status FROM Events WHERE Id=?",[id],|r|r.get::<_,i64>(0)).unwrap(),5);
        assert_eq!(std::fs::read_dir(folder.join("DeskCalendarBackups")).unwrap().count(),2);
        drop(conn); let _=std::fs::remove_dir_all(folder);
    }
    #[test]
    fn rejects_recurrences_and_keeps_existing_row() {
        let (folder,path)=fixture(); let value=input(); create_todo(&path,value).unwrap();
        let conn=Connection::open(&path).unwrap(); conn.execute("UPDATE Events SET RRule='FREQ=DAILY' WHERE Id=1",[]).unwrap(); drop(conn);
        assert!(update_todo(&path,1,input()).is_err());
        assert_eq!(Connection::open(&path).unwrap().query_row("SELECT COUNT(*) FROM Events",[],|r|r.get::<_,i64>(0)).unwrap(),1);
        let _=std::fs::remove_dir_all(folder);
    }
    #[test]
    fn creates_a_finite_weekly_series() {
        let (folder, path) = fixture(); let mut value = input();
        value.repeat_frequency = Some("weekly".into()); value.repeat_count = Some(8);
        create_todo(&path, value).unwrap();
        let conn = Connection::open(&path).unwrap();
        let (rule, raw): (String, String) = conn.query_row("SELECT RRule,Raw FROM Events", [], |row| Ok((row.get(0)?, row.get(1)?))).unwrap();
        assert_eq!(rule, "FREQ=WEEKLY;COUNT=8");
        assert!(raw.contains("RRULE:FREQ=WEEKLY;COUNT=8"));
        drop(conn); let _ = std::fs::remove_dir_all(folder);
    }
    #[test]
    fn soft_deletes_a_simple_todo_and_creates_a_backup() {
        let (folder, path) = fixture(); create_todo(&path, input()).unwrap();
        delete_todo(&path, 1).unwrap();
        let conn = Connection::open(&path).unwrap();
        assert_eq!(conn.query_row("SELECT Deleted FROM Events WHERE Id=1", [], |row| row.get::<_, i64>(0)).unwrap(), 1);
        assert_eq!(std::fs::read_dir(folder.join("DeskCalendarBackups")).unwrap().count(), 2);
        drop(conn); let _ = std::fs::remove_dir_all(folder);
    }
    #[test]
    fn edits_one_occurrence_without_changing_the_series_master() {
        let (folder, path) = fixture(); let mut series = input();
        series.repeat_frequency = Some("weekly".into()); series.repeat_count = Some(8);
        create_todo(&path, series).unwrap();
        let occurrence = input().start_time + 604_800;
        let mut changed = input(); changed.title = "仅当日修改".into();
        changed.start_time = occurrence + 300; changed.end_time = occurrence + 3_900;
        update_recurring_todo(&path, 1, occurrence, "occurrence", changed).unwrap();
        let conn = Connection::open(&path).unwrap();
        assert_eq!(conn.query_row("SELECT Summary FROM Events WHERE Id=1", [], |row| row.get::<_,String>(0)).unwrap(), "整理数据");
        let exception: (String,i64,i64) = conn.query_row("SELECT Summary,OriginalID,RecurrenceID FROM Events WHERE Id<>1", [],
            |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?))).unwrap();
        assert_eq!(exception, ("仅当日修改".into(), 1, occurrence));
        drop(conn); let _ = std::fs::remove_dir_all(folder);
    }
    #[test]
    fn edits_the_whole_series_and_preserves_its_rule() {
        let (folder, path) = fixture(); let mut series = input();
        series.repeat_frequency = Some("weekly".into()); series.repeat_count = Some(8);
        create_todo(&path, series).unwrap();
        let occurrence = input().start_time + 604_800;
        let mut changed = input(); changed.title = "全部修改".into();
        changed.start_time = occurrence + 300; changed.end_time = occurrence + 3_900;
        update_recurring_todo(&path, 1, occurrence, "series", changed).unwrap();
        let conn = Connection::open(&path).unwrap();
        let row: (String,i64,String,String) = conn.query_row("SELECT Summary,DTStart,RRule,Raw FROM Events WHERE Id=1", [],
            |item| Ok((item.get(0)?,item.get(1)?,item.get(2)?,item.get(3)?))).unwrap();
        assert_eq!(row.0, "全部修改"); assert_eq!(row.1, input().start_time + 300);
        assert_eq!(row.2, "FREQ=WEEKLY;COUNT=8"); assert!(row.3.contains("RRULE:FREQ=WEEKLY;COUNT=8"));
        drop(conn); let _ = std::fs::remove_dir_all(folder);
    }
    #[test]
    fn legacy_completed_copy_can_edit_its_whole_series() {
        let (folder, path) = fixture(); let mut series = input();
        series.repeat_frequency = Some("weekly".into()); series.repeat_count = Some(8);
        create_todo(&path, series).unwrap();
        let conn = Connection::open(&path).unwrap();
        conn.execute("INSERT INTO Events(CalendarId,Uid,Summary,Location,Description,Status,DTStart,DTEnd,LastKnownEnd,TimeStamp,
            RecurrenceID,OriginalID,AllDay,TransparentType,Dirty,Deleted,HasAlarm,HasAttendee,TimeZone,Duration,RRule,RDate,ExRule,ExDate,Organizer,Raw,IsTodo,CompletedTime)
            SELECT CalendarId,'detached',Summary,Location,Description,5,DTStart,DTEnd,LastKnownEnd,TimeStamp,0,0,AllDay,0,0,0,0,0,TimeZone,'','','','','','',Raw,1,123 FROM Events WHERE Id=1", []).unwrap();
        drop(conn);
        let mut changed = input(); changed.title = "系列新标题".into();
        update_recurring_todo(&path, 2, input().start_time, "series", changed).unwrap();
        let conn = Connection::open(&path).unwrap();
        assert_eq!(conn.query_row("SELECT Summary FROM Events WHERE Id=1", [], |row| row.get::<_,String>(0)).unwrap(), "系列新标题");
        assert_eq!(conn.query_row("SELECT Summary FROM Events WHERE Id=2", [], |row| row.get::<_,String>(0)).unwrap(), "系列新标题");
        assert_eq!(conn.query_row("SELECT OriginalID FROM Events WHERE Id=2", [], |row| row.get::<_,i64>(0)).unwrap(), 1);
        drop(conn); let _ = std::fs::remove_dir_all(folder);
    }
    #[test]
    fn deletes_one_occurrence_with_a_tombstone() {
        let (folder, path) = fixture(); let mut series = input();
        series.repeat_frequency = Some("weekly".into()); series.repeat_count = Some(8);
        create_todo(&path, series).unwrap();
        let occurrence = input().start_time + 604_800;
        delete_recurring_todo(&path, 1, occurrence, "occurrence").unwrap();
        let conn = Connection::open(&path).unwrap();
        let tombstone: (i64,i64,i64) = conn.query_row("SELECT Deleted,OriginalID,RecurrenceID FROM Events WHERE Id<>1", [],
            |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?))).unwrap();
        assert_eq!(tombstone, (1, 1, occurrence));
        assert_eq!(conn.query_row("SELECT Deleted FROM Events WHERE Id=1", [], |row| row.get::<_,i64>(0)).unwrap(), 0);
        drop(conn); let _ = std::fs::remove_dir_all(folder);
    }
    #[test]
    fn deletes_the_complete_series_and_exceptions() {
        let (folder, path) = fixture(); let mut series = input();
        series.repeat_frequency = Some("weekly".into()); series.repeat_count = Some(8);
        create_todo(&path, series).unwrap();
        let occurrence = input().start_time + 604_800;
        let mut changed = input(); changed.start_time = occurrence; changed.end_time = occurrence + 3_600;
        update_recurring_todo(&path, 1, occurrence, "occurrence", changed).unwrap();
        delete_recurring_todo(&path, 1, input().start_time, "series").unwrap();
        let conn = Connection::open(&path).unwrap();
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM Events WHERE Deleted=0", [], |row| row.get::<_,i64>(0)).unwrap(), 0);
        drop(conn); let _ = std::fs::remove_dir_all(folder);
    }
    #[test]
    fn dirty_recurring_todo_can_still_be_edited_and_deleted() {
        let (folder, path) = fixture(); let mut series = input();
        series.repeat_frequency = Some("weekly".into()); series.repeat_count = Some(8);
        create_todo(&path, series).unwrap();
        let conn = Connection::open(&path).unwrap();
        conn.execute("UPDATE Events SET Dirty=1,HasAttendee=1 WHERE Id=1", []).unwrap();
        drop(conn);
        let mut changed = input(); changed.title = "同步标记不阻止本地编辑".into();
        update_recurring_todo(&path, 1, input().start_time, "series", changed).unwrap();
        delete_recurring_todo(&path, 1, input().start_time, "series").unwrap();
        let conn = Connection::open(&path).unwrap();
        assert_eq!(conn.query_row("SELECT Deleted FROM Events WHERE Id=1", [], |row| row.get::<_,i64>(0)).unwrap(), 1);
        drop(conn); let _ = std::fs::remove_dir_all(folder);
    }
}
