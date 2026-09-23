//! Expand database series into read-only display instances, without inserting rows.

use crate::error::{AppError, AppResult};
use crate::models::mailmaster_event::MailMasterEvent;
use chrono::{DateTime, Days, TimeZone, Utc};
use rrule::{RRuleSet, Tz};
use std::collections::HashSet;

const MAX_INSTANCES_PER_SERIES: u16 = 10_000;

pub(super) struct SourceEvent {
    pub event: MailMasterEvent,
    pub calendar_id: i64,
    pub uid: String,
    pub rrule: String,
    pub rdate: String,
    pub exdate: String,
    pub exrule: String,
    pub timezone: String,
    pub raw: String,
    pub original_id: i64,
    pub recurrence_id: i64,
    pub deleted: bool,
}

impl SourceEvent {
    fn properties(&self) -> Vec<String> {
        root_properties(&self.raw)
    }

    fn recurring(&self) -> bool {
        if self.completed_copy_uid().is_some() { return false; }
        !self.rrule.is_empty() || !self.rdate.is_empty()
            || self.properties().iter().any(|line| matches!(property_name(line), "RRULE" | "RDATE"))
    }

    // MailMaster stores completed occurrences with a new database UID and no
    // recurrence columns, but leaves the master's UID and RRULE in copied Raw.
    fn completed_copy_uid(&self) -> Option<String> {
        if !self.event.is_todo
            || !self.rrule.is_empty() || !self.rdate.is_empty() { return None; }
        self.properties().into_iter().find_map(|line| {
            line.strip_prefix("UID:").filter(|uid| !uid.is_empty() && *uid != self.uid)
                .map(str::to_owned)
        })
    }

    fn exception_time(&self) -> Option<i64> {
        if self.recurrence_id != 0 { return Some(self.recurrence_id); }
        self.properties().iter().find_map(|line| {
            if property_name(line) != "RECURRENCE-ID" { return None; }
            let text = line.replacen("RECURRENCE-ID", "DTSTART", 1);
            text.parse::<RRuleSet>().ok().map(|set| set.get_dt_start().timestamp())
        })
    }

    fn cancelled(&self) -> bool {
        self.deleted || self.properties().iter().any(|line| line == "STATUS:CANCELLED")
    }
}

fn property_name(line: &str) -> &str {
    line.split([';', ':']).next().unwrap_or("")
}

fn root_properties(raw: &str) -> Vec<String> {
    let mut unfolded: Vec<String> = Vec::new();
    for line in raw.lines() {
        if line.starts_with([' ', '\t']) {
            if let Some(previous) = unfolded.last_mut() { previous.push_str(&line[1..]); }
        } else {
            unfolded.push(line.to_string());
        }
    }
    let mut depth = 0;
    unfolded.into_iter().filter(|line| {
        if line.starts_with("BEGIN:") { depth += 1; return false; }
        if line.starts_with("END:") { depth -= 1; return false; }
        depth == 1
    }).collect()
}

fn invalid_rule() -> AppError {
    AppError::InvalidToolArgs("无法展开邮箱大师的重复规则".into())
}

fn utc_date(timestamp: i64) -> AppResult<DateTime<Tz>> {
    Utc.timestamp_opt(timestamp, 0).single().map(|date| date.with_timezone(&Tz::UTC)).ok_or_else(invalid_rule)
}

fn start_property(source: &SourceEvent, properties: &[String]) -> AppResult<String> {
    if let Some(line) = properties.iter().find(|line| property_name(line) == "DTSTART") {
        return Ok(line.clone());
    }
    // A due-only VTODO uses its due time as the recurrence anchor.
    if let Some(line) = properties.iter().find(|line| property_name(line) == "DUE") {
        return Ok(line.replacen("DUE", "DTSTART", 1));
    }
    let date = utc_date(source.event.start_time)?;
    if !source.timezone.is_empty() {
        let zone = source.timezone.parse().map(Tz::Tz).map_err(|_| invalid_rule())?;
        return Ok(format!("DTSTART;TZID={}:{}", source.timezone, date.with_timezone(&zone).format("%Y%m%dT%H%M%S")));
    }
    Ok(format!("DTSTART:{}", date.format("%Y%m%dT%H%M%SZ")))
}

fn append_property(lines: &mut Vec<String>, source: &SourceEvent, name: &str, value: &str) {
    let raw: Vec<_> = source.properties().into_iter().filter(|line| property_name(line) == name).collect();
    if value.is_empty() { lines.extend(raw); return; }
    if !raw.is_empty() && raw.iter().any(|line| line.split_once(':').map(|(_, text)| text) == Some(value)) {
        lines.extend(raw);
    } else if value.starts_with(&format!("{name}:")) || value.starts_with(&format!("{name};")) {
        lines.push(value.to_string());
    } else if matches!(name, "RDATE" | "EXDATE") && !value.contains('Z') && !source.timezone.is_empty() {
        lines.push(format!("{name};TZID={}:{}", source.timezone, value));
    } else {
        lines.push(format!("{name}:{value}"));
    }
}

fn recurrence_set(source: &SourceEvent) -> AppResult<RRuleSet> {
    let mut lines = vec![start_property(source, &source.properties())?];
    for (name, value) in [("RRULE", &source.rrule), ("RDATE", &source.rdate),
                          ("EXDATE", &source.exdate), ("EXRULE", &source.exrule)] {
        append_property(&mut lines, source, name, value);
    }
    lines.join("\n").parse::<RRuleSet>().map_err(|_| invalid_rule())
}

pub(super) fn overlaps(event: &MailMasterEvent, start: i64, end: i64) -> bool {
    event.start_time < end && (event.end_time > start
        || (event.start_time == event.end_time && event.start_time >= start))
}

fn series_instances(source: &SourceEvent, start: i64, end: i64) -> AppResult<Vec<MailMasterEvent>> {
    let duration = source.event.end_time.saturating_sub(source.event.start_time).max(0);
    let set = recurrence_set(source)?;
    // Include occurrences starting before the viewport but still overlapping it.
    let lower = start.saturating_sub(duration).saturating_sub(86_400);
    let result = set.after(utc_date(lower)?).before(utc_date(end)?).all(MAX_INSTANCES_PER_SERIES);
    if result.limited { return Err(AppError::InvalidToolArgs("重复实例超出安全展开上限".into())); }
    let mut seen = HashSet::new();
    Ok(result.dates.into_iter().filter_map(|date| {
        if !seen.insert(date.timestamp()) { return None; }
        let mut event = source.event.clone();
        event.start_time = date.timestamp();
        event.end_time = if event.is_all_day {
            date.checked_add_days(Days::new((duration / 86_400).max(1) as u64))?.timestamp()
        } else { event.start_time.checked_add(duration)? };
        event.instance_id = format!("{}:{}", event.id, event.start_time);
        event.is_recurring = true;
        overlaps(&event, start, end).then_some(event)
    }).collect())
}

/// Expands masters and lets detached/moved/deleted exceptions replace original slots.
pub(super) fn expand(sources: Vec<SourceEvent>, start: i64, end: i64) -> Vec<MailMasterEvent> {
    #[derive(Clone)]
    struct SeriesOrigin { calendar_id: i64, master_id: i64, uid: String, is_override: bool }
    impl SeriesOrigin {
        fn related(&self, other: &Self) -> bool {
            self.calendar_id == other.calendar_id
                && ((self.master_id != 0 && self.master_id == other.master_id)
                    || (!self.uid.is_empty() && self.uid == other.uid))
        }
    }
    let mut output: Vec<(MailMasterEvent, Option<SeriesOrigin>)> = Vec::new();
    for source in &sources {
        if source.cancelled() { continue; }
        if source.exception_time().is_some() || !source.recurring() {
            if overlaps(&source.event, start, end) {
                let completed_uid = source.completed_copy_uid();
                let is_override = source.exception_time().is_some()
                    || source.original_id != 0
                    || completed_uid.is_some();
                let origin = is_override.then(|| SeriesOrigin {
                    calendar_id: source.calendar_id,
                    master_id: source.original_id,
                    uid: completed_uid.unwrap_or_else(|| source.uid.clone()),
                    is_override: true,
                });
                let mut event = source.event.clone();
                event.is_recurring = is_override;
                output.push((event, origin));
            }
            continue;
        }
        let suppressed: HashSet<_> = sources.iter().filter(|other| {
            other.calendar_id == source.calendar_id &&
                (other.original_id == source.event.id || (!source.uid.is_empty() && other.uid == source.uid))
        }).filter_map(SourceEvent::exception_time).collect();
        let mut suppressed = suppressed;
        suppressed.extend(sources.iter().filter(|other| {
            other.calendar_id == source.calendar_id && !other.cancelled()
                && other.completed_copy_uid().as_deref() == Some(source.uid.as_str())
        }).map(|other| other.event.start_time));
        match series_instances(source, start, end) {
            Ok(instances) => output.extend(instances.into_iter()
                .filter(|event| !suppressed.contains(&event.start_time))
                .map(|event| (event, Some(SeriesOrigin { calendar_id: source.calendar_id,
                    master_id: source.event.id, uid: source.uid.clone(), is_override: false })))),
            Err(_) => {
                tracing::warn!(event_id = source.event.id, "Cannot expand recurrence; showing stored instance only");
                let mut event = source.event.clone();
                event.is_recurring = true;
                if overlaps(&event, start, end) {
                    output.push((event, Some(SeriesOrigin { calendar_id: source.calendar_id,
                        master_id: source.event.id, uid: source.uid.clone(), is_override: false })));
                }
            }
        }
    }
    output.sort_by_key(|(event, _)| (event.start_time, event.id));
    let mut deduplicated: Vec<(MailMasterEvent, Option<SeriesOrigin>)> = Vec::new();
    for (event, origin) in output {
        let same_occurrence = |other: &MailMasterEvent| {
            other.start_time == event.start_time
                && other.end_time == event.end_time
                && other.title == event.title
                && other.description == event.description
                && other.location == event.location
                && other.is_todo == event.is_todo
        };
        if let Some(index) = deduplicated.iter().position(|(other, other_origin)|
            origin.as_ref().zip(other_origin.as_ref()).is_some_and(|(left, right)| left.related(right))
                && same_occurrence(other)) {
            let (existing, existing_origin) = &deduplicated[index];
            let incoming_override = origin.as_ref().is_some_and(|item| item.is_override);
            let existing_override = existing_origin.as_ref().is_some_and(|item| item.is_override);
            if incoming_override && (!existing_override || event.id >= existing.id) {
                deduplicated[index] = (event, origin);
            }
        } else {
            deduplicated.push((event, origin));
        }
    }
    deduplicated.into_iter().map(|(event, _)| event).collect()
}

#[cfg(test)]
#[path = "mailmaster_recurrence_tests.rs"]
mod tests;
