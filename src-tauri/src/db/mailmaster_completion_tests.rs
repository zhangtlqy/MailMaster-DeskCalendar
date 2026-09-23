use super::*;
use super::super::mailmaster_repo::list_events;
use std::path::PathBuf;

struct Fixture { folder: PathBuf, path: PathBuf, start: i64 }
impl Fixture {
    fn new() -> Self {
        let folder = std::env::temp_dir().join(format!("deskcalendar-completion-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir(&folder).unwrap();
        let path = folder.join("calendar.db");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL;
          CREATE TABLE Calendars(Id INTEGER PRIMARY KEY,DisplayName TEXT,Color INTEGER,Deleted INTEGER);
          INSERT INTO Calendars VALUES(5,'学习',0,0);
          CREATE TABLE Events(Id INTEGER PRIMARY KEY, CalendarId INTEGER,Uid TEXT,Summary TEXT,Location TEXT,
            Description TEXT,Status INTEGER,DTStart INTEGER,DTEnd INTEGER,LastKnownEnd INTEGER,TimeStamp INTEGER,
            RecurrenceID INTEGER DEFAULT 0,OriginalID INTEGER DEFAULT 0,AllDay INTEGER DEFAULT 0,
            Dirty INTEGER DEFAULT 0,Deleted INTEGER DEFAULT 0,HasAlarm INTEGER DEFAULT 0,HasAttendee INTEGER DEFAULT 0,
            TimeZone TEXT,Raw TEXT,IsTodo INTEGER,CompletedTime INTEGER DEFAULT 0,RRule TEXT,RDate TEXT,ExRule TEXT,ExDate TEXT);
        ").unwrap();
        let start = DateTime::parse_from_rfc3339("2026-09-15T15:20:00+08:00").unwrap().timestamp();
        conn.execute("INSERT INTO Events(Id,CalendarId,Uid,Summary,Description,Status,DTStart,DTEnd,Raw,IsTodo,RRule)
          VALUES(1,5,'series','应用随机过程','地点：一101',4,?1,?2,?3,1,'FREQ=WEEKLY;COUNT=3;BYDAY=TU')",
          params![start,start+5400,"BEGIN:VTODO\r\nUID:series\r\nDTSTART:20260915T072000Z\r\nRRULE:FREQ=WEEKLY;COUNT=3;BYDAY=TU\r\nEND:VTODO\r\n"]).unwrap();
        Self { folder, path, start }
    }
    fn events(&self) -> Vec<crate::models::mailmaster_event::MailMasterEvent> {
        list_events(&self.path,self.start,self.start+3*604800).unwrap()
    }
}
impl Drop for Fixture { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.folder); } }

#[test]
fn complete_one_occurrence_retry_and_undo_preserve_the_series() {
    let f = Fixture::new();
    let second = f.start+604800;
    set_occurrence_completed(&f.path,1,second,true).unwrap();
    set_occurrence_completed(&f.path,1,second,true).unwrap();
    let events=f.events();
    assert_eq!(events.len(),3);
    assert_eq!(events.iter().map(|e|e.is_completed).collect::<Vec<_>>(),vec![false,true,false]);
    assert_eq!(events[1].description.as_deref(),Some("地点：一101"));
    let conn=Connection::open(&f.path).unwrap();
    assert_eq!(conn.query_row("SELECT COUNT(*) FROM Events",[],|r|r.get::<_,i64>(0)).unwrap(),2);
    assert_eq!(conn.query_row("SELECT Status FROM Events WHERE Id=1",[],|r|r.get::<_,i64>(0)).unwrap(),4);
    let raw:String=conn.query_row("SELECT Raw FROM Events WHERE Id=?",[events[1].id],|r|r.get(0)).unwrap();
    assert!(raw.contains("RECURRENCE-ID:") && raw.contains("STATUS:COMPLETED") && !raw.contains("RRULE"));
    drop(conn);
    // Stale master ID resolves to the existing exception, never a second copy.
    set_occurrence_completed(&f.path,1,second,false).unwrap();
    assert!(f.events().iter().all(|e|!e.is_completed));
    set_occurrence_completed(&f.path,events[1].id,second,true).unwrap();
    assert!(f.events()[1].is_completed);
    let backups=std::fs::read_dir(f.folder.join("DeskCalendarBackups")).unwrap().count();
    assert_eq!(backups,3);
}

#[test]
fn invalid_or_excluded_occurrence_and_dirty_master_do_not_write() {
    let f=Fixture::new();
    assert!(set_occurrence_completed(&f.path,1,f.start+86400,true).is_err());
    let conn=Connection::open(&f.path).unwrap();
    conn.execute("UPDATE Events SET ExDate='20260922T072000Z' WHERE Id=1",[]).unwrap();
    assert!(set_occurrence_completed(&f.path,1,f.start+604800,true).is_err());
    conn.execute("UPDATE Events SET Dirty=1 WHERE Id=1",[]).unwrap();
    assert!(set_occurrence_completed(&f.path,1,f.start,true).is_err());
    assert_eq!(conn.query_row("SELECT COUNT(*) FROM Events",[],|r|r.get::<_,i64>(0)).unwrap(),1);
    assert!(!f.folder.join("DeskCalendarBackups").exists());
}

#[test]
fn mailmaster_completed_copy_can_be_undone_without_weekly_duplicates() {
    let f=Fixture::new();
    let conn=Connection::open(&f.path).unwrap();
    conn.execute("INSERT INTO Events(CalendarId,Uid,Summary,Status,DTStart,DTEnd,Raw,IsTodo,CompletedTime,RRule)
       SELECT CalendarId,'detached',Summary,5,DTStart,DTEnd,Raw,1,123,'' FROM Events WHERE Id=1",[]).unwrap();
    drop(conn);
    let events=f.events();
    assert_eq!(events.len(),3);
    set_occurrence_completed(&f.path,events[0].id,f.start,false).unwrap();
    let events=f.events();
    assert_eq!(events.len(),3);
    assert!(events.iter().all(|e|!e.is_completed));
}
