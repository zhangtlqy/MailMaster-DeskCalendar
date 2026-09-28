use crate::error::{AppError, AppResult};
use crate::models::mailmaster_event::{MailMasterCalendar, MailMasterEvent};
use rusqlite::{Connection, OpenFlags};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use super::mailmaster_recurrence::{expand, SourceEvent};
use super::mailmaster_accounts::{account_emails, account_id};

const DEFAULT_EVENT_COLOR: &str = "#4C9AFF";
pub use super::mailmaster_completion::set_occurrence_completed;
pub use super::mailmaster_todos::{create_todo, delete_recurring_todo, delete_todo, update_recurring_todo, update_todo};

/// Lists calendars independently of date range; visibility is only a GUI default.
pub fn list_calendars(path: &Path) -> AppResult<Vec<MailMasterCalendar>> {
    let connection = open_read_only(path)?;
    let emails = account_emails(path);
    let mut statement = connection.prepare(
        "SELECT Id, DisplayName, Color, COALESCE(Visible,0), COALESCE(AccountId,'') FROM Calendars WHERE Deleted=0 ORDER BY CalendarOrder,Id",
    )?;
    let rows = statement.query_map([], |row| {
        let account_id = account_id(row.get(4)?);
        Ok(MailMasterCalendar {
        id: row.get(0)?, name: non_empty(row.get(1)?, "未命名日历"),
        color: color_hex(row.get(2)?), visible: row.get::<_, i64>(3)? != 0,
        account_email: account_id.as_ref().and_then(|id| emails.get(id)).cloned(), account_id,
    })})?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

/// Resolves MailMaster's per-user calendar database without creating files.
pub fn default_database_path() -> AppResult<PathBuf> {
    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::Io("无法定位 LOCALAPPDATA".to_string()))?;
    Ok(local_data.join("Netease").join("MailMaster").join("data").join("calendar.db"))
}

/// Reads non-deleted events; the GUI applies calendar visibility after expansion.
pub fn list_events(path: &Path, start: i64, end: i64) -> AppResult<Vec<MailMasterEvent>> {
    if end <= start {
        return Err(AppError::InvalidTimeRange(start, end));
    }
    if !path.is_file() {
        return Err(AppError::Io(format!("未找到网易邮箱大师日历：{}", path.display())));
    }

    let connection = open_read_only(path)?;
    let mut statement = connection.prepare(EVENT_QUERY)?;
    let rows = statement.query_map([start, end], map_event)?;
    let sources = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(expand(sources, start, end))
}

/// Confirms that a selected file is a readable MailMaster calendar database.
pub fn validate_database(path: &Path) -> AppResult<PathBuf> {
    if !path.is_file() {
        return Err(AppError::Io(format!("数据库文件不存在：{}", path.display())));
    }
    let connection = open_read_only(path)?;
    for table in ["Events", "Calendars"] {
        let count: i64 = connection.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |row| row.get(0),
        )?;
        if count == 0 {
            return Err(AppError::Io(format!("所选文件不是网易邮箱大师日历数据库：缺少 {table} 表")));
        }
    }
    path.canonicalize().map_err(AppError::from)
}

/// Returns calendar/event totals after validating and opening the database read-only.
pub fn database_counts(path: &Path) -> AppResult<(PathBuf, i64, i64)> {
    let canonical_path = validate_database(path)?;
    let connection = open_read_only(&canonical_path)?;
    let calendar_count = connection.query_row(
        "SELECT COUNT(*) FROM Calendars WHERE Deleted = 0",
        [],
        |row| row.get(0),
    )?;
    let event_count = connection.query_row(
        "SELECT COUNT(*) FROM Events WHERE Deleted = 0",
        [],
        |row| row.get(0),
    )?;
    Ok((canonical_path, calendar_count, event_count))
}

/// Toggles completion for a MailMaster VTODO using the minimal field update
/// verified against the desktop client's local database.
pub fn set_todo_completed(path: &Path, event_id: i64, completed: bool) -> AppResult<bool> {
    validate_database(path)?;
    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let mut connection = Connection::open_with_flags(path, flags)?;
    connection.busy_timeout(Duration::from_secs(10))?;
    let transaction = connection.transaction()?;
    let recurring: bool = transaction.query_row(
        "SELECT COALESCE(RRule,'') <> '' OR COALESCE(RDate,'') <> '' OR COALESCE(Raw,'') LIKE '%RRULE:%' OR COALESCE(Raw,'') LIKE '%RDATE%' FROM Events WHERE Id=?1",
        [event_id], |row| row.get(0),
    )?;
    if recurring {
        return Err(AppError::InvalidToolArgs("重复待办请在邮箱大师中修改本次完成状态".into()));
    }
    let (is_todo, current_status, completed_time): (i64, Option<i64>, Option<i64>) = transaction
        .query_row(
            "SELECT IsTodo, Status, CompletedTime FROM Events WHERE Id = ?1 AND Deleted = 0",
            [event_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
    if is_todo == 0 {
        return Err(AppError::InvalidToolArgs("只有待办事项可以切换完成状态".to_string()));
    }
    let current_completed = current_status == Some(5) || completed_time.unwrap_or(0) > 0;
    if current_completed != completed {
        let timestamp = if completed {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|error| AppError::Internal(error.to_string()))?
                .as_secs() as i64
        } else {
            0
        };
        transaction.execute(
            "UPDATE Events SET Status = ?1, CompletedTime = ?2 WHERE Id = ?3 AND IsTodo <> 0 AND Deleted = 0",
            rusqlite::params![if completed { 5 } else { 4 }, timestamp, event_id],
        )?;
    }
    transaction.commit()?;
    Ok(completed)
}

fn open_read_only(path: &Path) -> AppResult<Connection> {
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    Connection::open_with_flags(path, flags).map_err(AppError::from)
}

pub(super) fn map_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<SourceEvent> {
    let raw_color: Option<i64> = row.get(6)?;
    let event = MailMasterEvent {
        id: row.get(0)?,
        calendar_id: row.get(11)?,
        instance_id: format!("{}:{}", row.get::<_, i64>(0)?, row.get::<_, i64>(2)?),
        is_recurring: false,
        title: non_empty(row.get(1)?, "（无标题）"),
        start_time: row.get(2)?,
        end_time: row.get(3)?,
        is_all_day: row.get::<_, i64>(4)? != 0,
        calendar_name: non_empty(row.get(5)?, "网易邮箱大师"),
        color: color_hex(raw_color),
        location: optional_text(row.get(7)?),
        description: optional_text(row.get(8)?),
        is_todo: row.get::<_, i64>(9)? != 0,
        is_completed: row.get::<_, i64>(10)? != 0,
    };
    Ok(SourceEvent {
        event, calendar_id: row.get(11)?, uid: row.get(12)?, rrule: row.get(13)?,
        rdate: row.get(14)?, exdate: row.get(15)?, exrule: row.get(16)?,
        timezone: row.get(17)?, raw: row.get(18)?, original_id: row.get(19)?,
        recurrence_id: row.get(20)?, deleted: row.get(21)?,
    })
}

fn non_empty(value: Option<String>, fallback: &str) -> String {
    optional_text(value).unwrap_or_else(|| fallback.to_string())
}

fn optional_text(value: Option<String>) -> Option<String> {
    value.map(|text| text.trim().to_string()).filter(|text| !text.is_empty())
}

fn color_hex(value: Option<i64>) -> String {
    value
        .map(|color| format!("#{:06X}", color & 0xFF_FFFF))
        .unwrap_or_else(|| DEFAULT_EVENT_COLOR.to_string())
}

pub(super) const EVENT_QUERY: &str = r#"
    SELECT e.Id, e.Summary, e.DTStart, e.DTEnd, e.AllDay,
           c.DisplayName, c.Color, e.Location, e.Description, e.IsTodo,
           CASE WHEN e.IsTodo <> 0 AND (e.Status = 5 OR COALESCE(e.CompletedTime, 0) > 0)
                THEN 1 ELSE 0 END AS IsCompleted,
           e.CalendarId, COALESCE(e.Uid,''), COALESCE(e.RRule,''), COALESCE(e.RDate,''),
           COALESCE(e.ExDate,''), COALESCE(e.ExRule,''), COALESCE(e.TimeZone,''),
           COALESCE(e.Raw,''), COALESCE(e.OriginalID,0), COALESCE(e.RecurrenceID,0), e.Deleted
    FROM Events AS e
    INNER JOIN Calendars AS c ON c.Id = e.CalendarId
    WHERE c.Deleted = 0
      AND ((e.Deleted = 0 AND (
          (e.DTStart < ?2 AND (e.DTEnd > ?1 OR (e.DTEnd=e.DTStart AND e.DTStart>=?1)))
          OR COALESCE(e.RRule,'') <> '' OR COALESCE(e.RDate,'') <> ''
          OR COALESCE(e.Raw,'') LIKE '%RRULE:%' OR COALESCE(e.Raw,'') LIKE '%RDATE%'))
        OR COALESCE(e.OriginalID,0) <> 0 OR COALESCE(e.RecurrenceID,0) <> 0
        OR COALESCE(e.Raw,'') LIKE '%RECURRENCE-ID%')
    ORDER BY e.DTStart, e.Id
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn color_conversion_uses_rgb_bytes() {
        assert_eq!(color_hex(Some(0x12_34_56)), "#123456");
        assert_eq!(color_hex(None), DEFAULT_EVENT_COLOR);
    }

    #[test]
    fn local_database_is_readable_when_installed() {
        let Ok(path) = default_database_path() else { return };
        if !path.is_file() { return; }
        let events = list_events(&path, 1_609_459_200, 1_893_456_000)
            .unwrap_or_else(|error| panic!("只读查询失败：{error}"));
        assert!(!events.is_empty());
        let calendars = list_calendars(&path).expect("read calendar picker data");
        assert!(events.iter().all(|event| calendars.iter().any(|calendar| calendar.id == event.calendar_id)));
    }


    #[test]
    fn selected_database_requires_mailmaster_tables() {
        let path = std::env::temp_dir().join(format!("deskcalendar-invalid-{}.db", std::process::id()));
        let connection = Connection::open(&path).expect("create temporary sqlite database");
        connection.execute("CREATE TABLE Events (Id INTEGER)", []).unwrap();
        drop(connection);
        let error = validate_database(&path).expect_err("Calendars table must be required");
        assert!(error.to_string().contains("Calendars"));
        let _ = std::fs::remove_file(path);
    }


    #[test]
    fn toggles_only_todo_completion_fields() {
        let path = std::env::temp_dir().join(format!("deskcalendar-toggle-{}.db", std::process::id()));
        let connection = Connection::open(&path).expect("create test database");
        connection.execute_batch(
            "CREATE TABLE Calendars (Id INTEGER PRIMARY KEY, Deleted INTEGER);\
             CREATE TABLE Events (Id INTEGER PRIMARY KEY, IsTodo INTEGER, Status INTEGER, CompletedTime BIGINT, Deleted INTEGER, RRule TEXT DEFAULT '', RDate TEXT DEFAULT '', Raw TEXT DEFAULT '');\
             INSERT INTO Calendars VALUES (1, 0);\
             INSERT INTO Events (Id,IsTodo,Status,CompletedTime,Deleted) VALUES (7, 1, 4, 0, 0);",
        ).unwrap();
        drop(connection);

        assert!(set_todo_completed(&path, 7, true).unwrap());
        let connection = Connection::open(&path).unwrap();
        let completed: (i64, i64) = connection
            .query_row("SELECT Status, CompletedTime FROM Events WHERE Id = 7", [], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap();
        assert_eq!(completed.0, 5);
        assert!(completed.1 > 0);
        drop(connection);
        assert!(!set_todo_completed(&path, 7, false).unwrap());
        let connection = Connection::open(&path).unwrap();
        let incomplete: (i64, i64) = connection
            .query_row("SELECT Status, CompletedTime FROM Events WHERE Id = 7", [], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap();
        assert_eq!(incomplete, (4, 0));
        drop(connection);
        let _ = std::fs::remove_file(path);
    }
}
