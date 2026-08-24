use crate::db::mailmaster_repo;
use crate::error::AppResult;
use crate::models::mailmaster_event::MailMasterEvent;
use std::path::PathBuf;
use serde::Serialize;

#[derive(Serialize)]
pub struct MailMasterDatabaseCheck {
    pub path: String,
    pub calendar_count: i64,
    pub event_count: i64,
}

fn display_path(path: PathBuf) -> String {
    let text = path.to_string_lossy().into_owned();
    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
}

fn resolve_database_path(database_path: Option<String>) -> AppResult<PathBuf> {
    match database_path.filter(|path| !path.trim().is_empty()) {
        Some(path) => Ok(PathBuf::from(path)),
        None => mailmaster_repo::default_database_path(),
    }
}

/// Lists MailMaster events for a Unix-second range using a read-only connection.
#[tauri::command(rename_all = "snake_case")]
pub fn list_mailmaster_events(start_date: i64, end_date: i64, database_path: Option<String>) -> AppResult<Vec<MailMasterEvent>> {
    let path = resolve_database_path(database_path)?;
    mailmaster_repo::list_events(&path, start_date, end_date)
}

#[tauri::command]
pub fn get_default_mailmaster_database_path() -> AppResult<String> {
    Ok(mailmaster_repo::default_database_path()?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn validate_mailmaster_database(path: String) -> AppResult<String> {
    Ok(display_path(mailmaster_repo::validate_database(&PathBuf::from(path))?))
}

#[tauri::command(rename_all = "snake_case")]
pub fn check_mailmaster_database(database_path: Option<String>) -> AppResult<MailMasterDatabaseCheck> {
    let path = resolve_database_path(database_path)?;
    let (path, calendar_count, event_count) = mailmaster_repo::database_counts(&path)?;
    Ok(MailMasterDatabaseCheck { path: display_path(path), calendar_count, event_count })
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_mailmaster_todo_completed(
    event_id: i64,
    completed: bool,
    database_path: Option<String>,
) -> AppResult<bool> {
    let path = resolve_database_path(database_path)?;
    mailmaster_repo::set_todo_completed(&path, event_id, completed)
}
