use crate::error::{AppError, AppResult};
use crate::models::mailmaster_event::MailMasterEvent;
use rusqlite::{Connection, OpenFlags};
use std::path::{Path, PathBuf};

const DEFAULT_EVENT_COLOR: &str = "#4C9AFF";

/// Resolves MailMaster's per-user calendar database without creating files.
pub fn default_database_path() -> AppResult<PathBuf> {
    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::Io("无法定位 LOCALAPPDATA".to_string()))?;
    Ok(local_data.join("Netease").join("MailMaster").join("data").join("calendar.db"))
}

/// Reads visible, non-deleted MailMaster events overlapping a Unix-second range.
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
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
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

fn open_read_only(path: &Path) -> AppResult<Connection> {
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    Connection::open_with_flags(path, flags).map_err(AppError::from)
}

fn map_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<MailMasterEvent> {
    let raw_color: Option<i64> = row.get(6)?;
    Ok(MailMasterEvent {
        id: row.get(0)?,
        title: non_empty(row.get(1)?, "（无标题）"),
        start_time: row.get(2)?,
        end_time: row.get(3)?,
        is_all_day: row.get::<_, i64>(4)? != 0,
        calendar_name: non_empty(row.get(5)?, "网易邮箱大师"),
        color: color_hex(raw_color),
        location: optional_text(row.get(7)?),
        description: optional_text(row.get(8)?),
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

const EVENT_QUERY: &str = r#"
    SELECT e.Id, e.Summary, e.DTStart, e.DTEnd, e.AllDay,
           c.DisplayName, c.Color, e.Location, e.Description
    FROM Events AS e
    INNER JOIN Calendars AS c ON c.Id = e.CalendarId
    WHERE e.Deleted = 0 AND c.Deleted = 0 AND c.Visible <> 0
      AND e.DTEnd > ?1 AND e.DTStart < ?2
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
}
