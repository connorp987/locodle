use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use chrono::{DateTime, NaiveDate, Utc};
use serde_json::{Value, json};
use sqlx::Row;

use crate::{
    AppState,
    util::{date_as_js_json, error, iso_millis, js_round},
};

pub async fn stats(State(app): State<AppState>, Path(user_id): Path<String>) -> Response {
    match load_stats(&app, &user_id).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => {
            tracing::error!("user stats: {e}");
            error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch user stats")
        }
    }
}

async fn load_stats(app: &AppState, user_id: &str) -> Result<Value, sqlx::Error> {
    let db = &app.db;
    let (user, stats, history, streak, total_guesses) = tokio::try_join!(
        sqlx::query("SELECT id, username, avatar FROM discord_users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(db),
        sqlx::query(
            "SELECT COUNT(*) AS games_played, \
                    COUNT(*) FILTER (WHERE won = true) AS games_won, \
                    ROUND(AVG(guesses_count)::numeric, 1)::float8 AS avg_guesses, \
                    MIN(guesses_count) FILTER (WHERE won = true) AS best_game, \
                    ROUND(AVG(score)::numeric, 0)::float8 AS avg_distance \
             FROM daily_results WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_one(db),
        sqlx::query(
            "SELECT date, score AS distance, guesses_count, won FROM daily_results \
             WHERE user_id = $1 ORDER BY date DESC LIMIT 10",
        )
        .bind(user_id)
        .fetch_all(db),
        sqlx::query_scalar::<_, i64>(
            "WITH dates AS ( \
               SELECT date, won, date - (ROW_NUMBER() OVER (ORDER BY date DESC))::int AS grp \
               FROM daily_results WHERE user_id = $1 AND won = true ORDER BY date DESC \
             ) \
             SELECT COUNT(*) AS streak FROM dates WHERE grp = (SELECT grp FROM dates LIMIT 1)",
        )
        .bind(user_id)
        .fetch_one(db),
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM user_guesses WHERE user_id = $1")
            .bind(user_id)
            .fetch_one(db),
    )?;

    let user = match user {
        Some(u) => json!({
            "id": u.try_get::<String, _>("id")?,
            "username": u.try_get::<Option<String>, _>("username")?,
            "avatar": u.try_get::<Option<String>, _>("avatar")?,
        }),
        None => json!({ "id": user_id, "username": null, "avatar": null }),
    };

    let played: i64 = stats.try_get("games_played")?;
    let won: i64 = stats.try_get("games_won")?;
    let avg_guesses: Option<f64> = stats.try_get("avg_guesses")?;
    let best_game: Option<i32> = stats.try_get("best_game")?;
    let avg_distance: Option<f64> = stats.try_get("avg_distance")?;

    let recent: Vec<Value> = history
        .iter()
        .map(|r| {
            Ok(json!({
                "date": date_as_js_json(r.try_get::<NaiveDate, _>("date")?),
                "distance": r.try_get::<i32, _>("distance")?,
                "guessCount": r.try_get::<i32, _>("guesses_count")?,
                "won": r.try_get::<Option<bool>, _>("won")?,
            }))
        })
        .collect::<Result<_, sqlx::Error>>()?;

    Ok(json!({
        "user": user,
        "stats": {
            "gamesPlayed": played,
            "gamesWon": won,
            "winRate": if played > 0 { js_round(won as f64 / played as f64 * 100.0) as i64 } else { 0 },
            "avgGuesses": avg_guesses.filter(|v| *v != 0.0).unwrap_or(0.0),
            "bestGame": best_game.filter(|v| *v != 0),
            "avgDistance": avg_distance.map(|v| v.trunc() as i64).unwrap_or(0),
            "currentStreak": streak,
            "totalGuesses": total_guesses,
        },
        "recentGames": recent,
    }))
}

pub async fn guesses(
    State(app): State<AppState>,
    Path((user_id, date)): Path<(String, String)>,
) -> Response {
    match load_guesses(&app, &user_id, &date).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => {
            tracing::error!("user guesses: {e}");
            error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch guesses")
        }
    }
}

async fn load_guesses(app: &AppState, user_id: &str, date: &str) -> Result<Value, sqlx::Error> {
    // NUMERIC columns go out as strings, as node-postgres returned them
    let rows = sqlx::query(
        "SELECT guess_number, lat::text AS lat, lng::text AS lng, location_name, distance, \
                score::text AS score, direction, timestamp \
         FROM user_guesses WHERE user_id = $1 AND date = $2::date ORDER BY guess_number ASC",
    )
    .bind(user_id)
    .bind(date)
    .fetch_all(&app.db)
    .await?;

    let mut has_won = false;
    let guesses: Vec<Value> = rows
        .iter()
        .map(|r| {
            let distance: i32 = r.try_get("distance")?;
            has_won |= distance < 50;
            Ok(json!({
                "guess_number": r.try_get::<i32, _>("guess_number")?,
                "lat": r.try_get::<String, _>("lat")?,
                "lng": r.try_get::<String, _>("lng")?,
                "location_name": r.try_get::<Option<String>, _>("location_name")?,
                "distance": distance,
                "score": r.try_get::<String, _>("score")?,
                "direction": r.try_get::<Option<String>, _>("direction")?,
                "timestamp": r.try_get::<Option<DateTime<Utc>>, _>("timestamp")?.map(iso_millis),
            }))
        })
        .collect::<Result<_, sqlx::Error>>()?;

    let mut answer = Value::Null;
    if has_won && let Some(loc) = app.locations.daily(&app.db, Some(date)).await? {
        answer = json!({ "name": loc.name, "lat": loc.lat, "lng": loc.lng, "country": loc.country });
        if let Some(info) = app.place_info.get(&app.http, &loc).await {
            answer["info"] = info;
        }
    }

    Ok(json!({ "guesses": guesses, "answer": answer }))
}
