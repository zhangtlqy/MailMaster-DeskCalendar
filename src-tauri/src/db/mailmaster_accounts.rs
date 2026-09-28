//! Resolve calendar account labels from the sibling app database, without credentials.
use rusqlite::{Connection, OpenFlags};
use std::{collections::HashMap, path::Path, time::Duration};

pub(super) fn account_emails(calendar_path: &Path) -> HashMap<String, String> {
    let Some(parent) = calendar_path.parent() else { return HashMap::new(); };
    let path = parent.join("app.db");
    if !path.is_file() { return HashMap::new(); }
    match read_emails(&path) {
        Ok(emails) => emails,
        Err(_) => {
            tracing::warn!("Unable to read MailMaster account labels; using account IDs");
            HashMap::new()
        }
    }
}

fn read_emails(path: &Path) -> rusqlite::Result<HashMap<String, String>> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
    connection.busy_timeout(Duration::from_secs(1))?;
    let mut statement = connection.prepare("SELECT CAST(ID AS TEXT), TRIM(Email) FROM Account WHERE COALESCE(TRIM(Email),'') <> ''")?;
    let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

pub(super) fn account_id(value: String) -> Option<String> {
    let id = value.trim();
    if id.is_empty() || id.parse::<i64>().is_ok_and(|id| id <= 0) { None }
    else { Some(id.to_string()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_calendars_have_no_email_account() {
        assert_eq!(account_id("-1".into()), None);
        assert_eq!(account_id("".into()), None);
        assert_eq!(account_id(" 3 ".into()), Some("3".into()));
    }

    #[test]
    fn resolves_labels_from_sibling_database_and_handles_missing_file() {
        let dir = std::env::temp_dir().join(format!("calendar-accounts-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&dir).unwrap();
        let calendar = dir.join("calendar.db");
        assert!(account_emails(&calendar).is_empty());
        let conn = Connection::open(dir.join("app.db")).unwrap();
        conn.execute_batch("CREATE TABLE Account (ID INTEGER, Email TEXT); INSERT INTO Account VALUES (3,'person@example.com');").unwrap();
        drop(conn);
        assert_eq!(account_emails(&calendar).get("3").map(String::as_str), Some("person@example.com"));
        std::fs::remove_file(dir.join("app.db")).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
