use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};

use serde::Serialize;
use serde_json::Value;
use sqlx::{PgPool, Row, postgres::PgRow, types::Json};

use crate::{hints, selection, util::eastern_date_string};

#[derive(Serialize)]
pub struct Location {
    pub id: i32,
    pub name: String,
    pub lat: f64,
    pub lng: f64,
    pub country: String,
    pub hints: Value,
}

impl Location {
    fn from_row(row: &PgRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            lat: row.try_get("lat")?,
            lng: row.try_get("lng")?,
            country: row.try_get("country")?,
            hints: row.try_get::<Json<Value>, _>("hints")?.0,
        })
    }
}

// Cap on distinct cached date keys. Real usage is one per day; the cap only
// guards against clients sending endless spellings of the same date.
const CACHE_MAX: usize = 2000;

/// Date -> location cache. Past dates never change, and today's is fixed once
/// generated.
#[derive(Default)]
pub struct LocationCache {
    map: Mutex<HashMap<String, Arc<Location>>>,
    /// Serialises cache misses so concurrent first requests of the day don't
    /// each try to generate a location.
    fill: tokio::sync::Mutex<()>,
}

impl LocationCache {
    fn get(&self, date: &str) -> Option<Arc<Location>> {
        self.map.lock().unwrap().get(date).cloned()
    }

    /// The challenge location for `date` (today in Eastern time when absent).
    pub async fn daily(
        &self,
        db: &PgPool,
        date: Option<&str>,
    ) -> Result<Option<Arc<Location>>, sqlx::Error> {
        let target = date
            .filter(|d| !d.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(eastern_date_string);

        if let Some(hit) = self.get(&target) {
            return Ok(Some(hit));
        }

        let _guard = self.fill.lock().await;
        if let Some(hit) = self.get(&target) {
            return Ok(Some(hit));
        }

        let location = location_for_date(db, &target).await?.map(Arc::new);
        if let Some(loc) = &location {
            let mut map = self.map.lock().unwrap();
            if map.len() >= CACHE_MAX {
                map.clear();
            }
            map.insert(target, loc.clone());
        }
        Ok(location)
    }
}

async fn location_for_date(db: &PgPool, target: &str) -> Result<Option<Location>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT id, name, lat::float8 AS lat, lng::float8 AS lng, country, hints FROM locations \
         WHERE game_date = $1::date AND is_active = true AND is_daily_challenge = true LIMIT 1",
    )
    .bind(target)
    .fetch_optional(db)
    .await?;

    if let Some(row) = row {
        return Location::from_row(&row).map(Some);
    }

    // Only today's challenge is generated on demand; past dates stay missing.
    let today = eastern_date_string();
    if target == today {
        tracing::info!("generating location for {today}");
        return generate(db, &today).await.map(Some);
    }

    tracing::info!("no location for date {target}");
    Ok(None)
}

pub async fn available_dates(db: &PgPool) -> Result<Vec<Option<String>>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT DISTINCT TO_CHAR(game_date, 'YYYY-MM-DD') AS date FROM locations \
         WHERE is_active = true AND is_daily_challenge = true ORDER BY date DESC",
    )
    .fetch_all(db)
    .await
}

/// Every `(name, country)` in `locations`. The table has UNIQUE (name, country),
/// so none of these can be inserted again. (The Node version only excluded the
/// last 30 days, so it could pick a used name and fail the insert.) The seed
/// locations from `001_init.sql` are in the table too, so they're excluded as
/// well.
pub async fn used_keys(db: &PgPool) -> Result<HashSet<(String, String)>, sqlx::Error> {
    sqlx::query("SELECT name, country FROM locations")
        .fetch_all(db)
        .await?
        .iter()
        .map(|r| Ok((r.try_get("name")?, r.try_get("country")?)))
        .collect()
}

/// Recent daily challenges, newest first, for the variety rules. With
/// `before`, only days before that date.
pub async fn recent(
    db: &PgPool,
    before: Option<&str>,
) -> Result<Vec<selection::Past>, sqlx::Error> {
    sqlx::query(
        "SELECT name, country, lat::float8 AS lat, lng::float8 AS lng FROM locations \
         WHERE is_daily_challenge = true AND is_active = true AND game_date IS NOT NULL \
         AND ($1::date IS NULL OR game_date < $1::date) \
         ORDER BY game_date DESC LIMIT $2",
    )
    .bind(before)
    .bind(selection::RECENT_LIMIT as i64)
    .fetch_all(db)
    .await?
    .iter()
    .map(|r| {
        Ok(selection::Past {
            name: r.try_get("name")?,
            country: r.try_get("country")?,
            lat: r.try_get("lat")?,
            lng: r.try_get("lng")?,
        })
    })
    .collect()
}

async fn generate(db: &PgPool, today: &str) -> Result<Location, sqlx::Error> {
    let used = used_keys(db).await?;
    let recent = recent(db, Some(today)).await?;

    let all = hints::templates();
    let unused: Vec<hints::Template> = all
        .iter()
        .filter(|t| !used.contains(&(t.name.clone(), t.country.clone())))
        .cloned()
        .collect();

    tracing::info!(
        "{} unused locations left in the pool ({})",
        unused.len(),
        selection::tier_counts(&unused)
    );
    let Some(pick) = selection::pick(&unused, &all, &recent, &mut selection::Rng::from_entropy())
    else {
        tracing::error!("location pool exhausted: add entries to data/location_templates.json");
        return Err(sqlx::Error::RowNotFound);
    };
    let hints = hints::generate_hints(pick);

    let row = sqlx::query(
        "INSERT INTO locations (name, lat, lng, country, hints, game_date, is_daily_challenge) \
         VALUES ($1, $2, $3, $4, $5, $6::date, true) \
         ON CONFLICT (game_date) WHERE is_daily_challenge = true \
         DO UPDATE SET game_date = EXCLUDED.game_date \
         RETURNING id, name, lat::float8 AS lat, lng::float8 AS lng, country, hints",
    )
    .bind(&pick.name)
    .bind(pick.lat)
    .bind(pick.lng)
    .bind(&pick.country)
    .bind(Json(&hints))
    .bind(today)
    .fetch_one(db)
    .await?;

    let location = Location::from_row(&row)?;
    tracing::info!(
        "location for {today}: {}, {} (tier {}, {})",
        location.name,
        location.country,
        pick.tier,
        pick.kind
    );
    Ok(location)
}

