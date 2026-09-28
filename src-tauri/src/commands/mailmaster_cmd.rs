use crate::db::mailmaster_repo;
use crate::error::AppResult;
use crate::models::mailmaster_event::{MailMasterCalendar, MailMasterEvent};
use crate::db::TodoInput;
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

/// Lists all non-deleted calendars for the GUI's local display filter.
#[tauri::command(rename_all = "snake_case")]
pub fn list_mailmaster_calendars(database_path: Option<String>) -> AppResult<Vec<MailMasterCalendar>> {
    mailmaster_repo::list_calendars(&resolve_database_path(database_path)?)
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
    occurrence_start: Option<i64>,
) -> AppResult<bool> {
    let path = resolve_database_path(database_path)?;
    if let Some(start) = occurrence_start {
        return mailmaster_repo::set_occurrence_completed(&path, event_id, start, completed);
    }
    mailmaster_repo::set_todo_completed(&path, event_id, completed)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_mailmaster_todo(input: TodoInput, database_path: Option<String>) -> AppResult<()> {
    mailmaster_repo::create_todo(&resolve_database_path(database_path)?, input)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_mailmaster_todo(event_id: i64, input: TodoInput, database_path: Option<String>) -> AppResult<()> {
    mailmaster_repo::update_todo(&resolve_database_path(database_path)?, event_id, input)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_mailmaster_recurring_todo(event_id: i64, occurrence_start: i64, scope: String, input: TodoInput, database_path: Option<String>) -> AppResult<()> {
    mailmaster_repo::update_recurring_todo(&resolve_database_path(database_path)?, event_id, occurrence_start, &scope, input)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_mailmaster_todo(event_id: i64, database_path: Option<String>) -> AppResult<()> {
    mailmaster_repo::delete_todo(&resolve_database_path(database_path)?, event_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_mailmaster_recurring_todo(event_id: i64, occurrence_start: i64, scope: String, database_path: Option<String>) -> AppResult<()> {
    mailmaster_repo::delete_recurring_todo(&resolve_database_path(database_path)?, event_id, occurrence_start, &scope)
}
