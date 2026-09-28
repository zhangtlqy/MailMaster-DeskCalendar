//! Read-only diagnostic: cargo run --example list_mailmaster -- START END [DATABASE]
use desktop_calendar_tauri_lib::db::mailmaster_repo;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let start = args.next().ok_or("missing start Unix seconds")?.parse()?;
    let end = args.next().ok_or("missing end Unix seconds")?.parse()?;
    let path = match args.next() {
        Some(path) => PathBuf::from(path),
        None => mailmaster_repo::default_database_path()?,
    };
    let events = mailmaster_repo::list_events(&path, start, end)?;
    serde_json::to_writer(std::io::stdout(), &events)?;
    Ok(())
}
