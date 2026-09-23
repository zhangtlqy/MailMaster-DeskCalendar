use serde::Serialize;

/// Event projected from NetEase MailMaster's local calendar database.
#[derive(Debug, Clone, Serialize)]
pub struct MailMasterEvent {
    pub id: i64,
    pub calendar_id: i64,
    /// Unique display identity; `id` remains the physical database row ID.
    pub instance_id: String,
    /// Generated series instances cannot safely write completion to the master row.
    pub is_recurring: bool,
    pub title: String,
    pub start_time: i64,
    pub end_time: i64,
    pub is_all_day: bool,
    pub calendar_name: String,
    pub color: String,
    pub location: Option<String>,
    pub description: Option<String>,
    pub is_todo: bool,
    pub is_completed: bool,
}

/// A selectable calendar, including calendars without events in the current range.
#[derive(Debug, Serialize)]
pub struct MailMasterCalendar {
    pub id: i64,
    pub account_id: Option<String>,
    pub account_email: Option<String>,
    pub name: String,
    pub color: String,
    pub visible: bool,
}
