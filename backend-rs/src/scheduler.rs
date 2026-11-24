//! Daily jobs at fixed Eastern times (replaces node-cron).

use std::{future::Future, time::Duration};

use chrono::{DateTime, NaiveTime, TimeZone, Utc};
use chrono_tz::America::New_York;

/// Time until the next `hh:mm` America/New_York after `now`.
fn until_next(now: DateTime<Utc>, time: NaiveTime) -> Duration {
    let mut date = now.with_timezone(&New_York).date_naive();
    loop {
        if let Some(t) = New_York.from_local_datetime(&date.and_time(time)).earliest() {
            let t = t.with_timezone(&Utc);
            if t > now {
                return (t - now).to_std().unwrap_or_default();
            }
        }
        date = date.succ_opt().expect("date in range");
    }
}

pub fn daily<F, Fut>(name: &'static str, hour: u32, minute: u32, job: F)
where
    F: Fn() -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send,
{
    let Some(time) = NaiveTime::from_hms_opt(hour, minute, 0) else {
        tracing::error!("{name}: invalid time {hour}:{minute}, not scheduled");
        return;
    };
    tracing::info!("{name} scheduled daily at {hour}:{minute:02} Eastern");
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(until_next(Utc::now(), time)).await;
            tracing::info!("running scheduled job: {name}");
            job().await;
            // Make sure the next computation lands on the following day
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_run_is_eastern() {
        // 2026-11-24 14:00 UTC is 09:00 EST, so 09:30 is 30 minutes away
        let now = Utc.with_ymd_and_hms(2026, 11, 24, 14, 0, 0).unwrap();
        let t = NaiveTime::from_hms_opt(9, 30, 0).unwrap();
        assert_eq!(until_next(now, t), Duration::from_secs(30 * 60));
        // Just after: tomorrow
        let now = Utc.with_ymd_and_hms(2026, 11, 24, 14, 31, 0).unwrap();
        assert_eq!(until_next(now, t), Duration::from_secs(24 * 3600 - 60));
    }
}
