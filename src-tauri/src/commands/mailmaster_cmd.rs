use crate::db::mailmaster_repo;
use crate::error::AppResult;
use crate::models::mailmaster_event::MailMasterEvent;
use std::path::PathBuf;

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
    Ok(mailmaster_repo::validate_database(&PathBuf::from(path))?.to_string_lossy().into_owned())
}
