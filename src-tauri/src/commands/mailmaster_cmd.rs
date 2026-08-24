use crate::db::mailmaster_repo;
use crate::error::AppResult;
use crate::models::mailmaster_event::MailMasterEvent;

/// Lists MailMaster events for a Unix-second range using a read-only connection.
#[tauri::command(rename_all = "snake_case")]
pub fn list_mailmaster_events(start_date: i64, end_date: i64) -> AppResult<Vec<MailMasterEvent>> {
    let path = mailmaster_repo::default_database_path()?;
    mailmaster_repo::list_events(&path, start_date, end_date)
}
