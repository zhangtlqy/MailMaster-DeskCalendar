use serde::Serialize;

/// Read-only event projected from NetEase MailMaster's local calendar database.
#[derive(Debug, Clone, Serialize)]
pub struct MailMasterEvent {
    pub id: i64,
    pub title: String,
    pub start_time: i64,
    pub end_time: i64,
    pub is_all_day: bool,
    pub calendar_name: String,
    pub color: String,
    pub location: Option<String>,
    pub description: Option<String>,
}
