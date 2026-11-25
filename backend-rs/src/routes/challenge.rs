use std::collections::HashMap;

use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use sqlx::Row;

use crate::{
    AppState, calc, discord,
    util::{JsonBody, eastern_date_string, error, js_round, now_iso, num_field, str_field, truthy},
};

pub async fn daily_challenge(
    State(app): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let date = q.get("date").filter(|d| !d.is_empty());
    match app.locations.daily(&app.db, date.map(String::as_str)).await {
        Ok(Some(loc)) => Json(json!({
            "date": date.cloned().unwrap_or_else(eastern_date_string),
            "hints": loc.hints,
            "maxGuesses": 6,
        }))
        .into_response(),
        Ok(None) => error(StatusCode::NOT_FOUND, "No challenge found for this date"),
        Err(e) => {
            tracing::error!("daily-challenge: {e}");
            error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to load daily challenge")
        }
    }
}

/// `Number(x)` for a query string value: blank is 0, junk is NaN.
fn js_number(s: Option<&String>) -> f64 {
    match s {
        None => f64::NAN,
        Some(s) if s.trim().is_empty() => 0.0,
        Some(s) => s.trim().parse().unwrap_or(f64::NAN),
    }
}

pub async fn geocode(
    State(app): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let lat = js_number(q.get("lat"));
    let lng = js_number(q.get("lng"));
    if !lat.is_finite() || !lng.is_finite() || lat.abs() > 90.0 || lng.abs() > 180.0 {
        return error(StatusCode::BAD_REQUEST, "Invalid lat/lng");
    }
    match app.geocoder.lookup(&app.http, lat, lng).await {
        Some(v) => Json(&*v).into_response(),
        None => error(StatusCode::BAD_GATEWAY, "Couldn't look up this place"),
    }
}

/// Map-click guesses arrive named by their coordinates ("48.8566, 2.3522").
fn is_coordinate_name(s: &str) -> bool {
    fn number(s: &str) -> bool {
        let s = s.strip_prefix('-').unwrap_or(s);
        let (int, frac) = match s.split_once('.') {
            Some((i, f)) => (i, Some(f)),
            None => (s, None),
        };
        !int.is_empty()
            && int.bytes().all(|b| b.is_ascii_digit())
            && frac.is_none_or(|f| !f.is_empty() && f.bytes().all(|b| b.is_ascii_digit()))
    }
    s.split_once(", ").is_some_and(|(a, b)| number(a) && number(b))
}

pub async fn guess(State(app): State<AppState>, JsonBody(body): JsonBody) -> Response {
    let guess = &body["guess"];
    if !truthy(body.get("guess")) {
        return error(StatusCode::BAD_REQUEST, "Missing guess");
    }
    let (Some(lat), Some(lng)) = (num_field(guess, "lat"), num_field(guess, "lng")) else {
        return error(StatusCode::BAD_REQUEST, "Missing guess");
    };

    let date = str_field(&body, "date");
    let guess_name = str_field(guess, "name");

    // Reverse geocoding is slow (often 0.3-1.5s), so it runs in the
    // background: the guess is scored and returned right away, the client
    // fetches the name from /api/geocode, and the saved row is renamed once
    // the lookup finishes. Search guesses already have a name.
    let needs_name = guess_name.as_deref().is_none_or(is_coordinate_name);
    let name_lookup = needs_name.then(|| app.geocoder.lookup(&app.http, lat, lng));

    let location = match app.locations.daily(&app.db, date.as_deref()).await {
        Ok(Some(l)) => l,
        Ok(None) => return error(StatusCode::NOT_FOUND, "No challenge found for this date"),
        Err(e) => {
            tracing::error!("guess: {e}");
            return error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to process guess");
        }
    };

    let distance = calc::distance_km(lat, lng, location.lat, location.lng);
    let bearing = calc::bearing(lat, lng, location.lat, location.lng);
    let direction = calc::cardinal_direction(bearing);
    let score = js_round((100.0 - (distance / 20000.0) * 120.0) * 10.0) / 10.0;
    let distance_rounded = js_round(distance) as i64;
    let won = distance < 50.0;

    if let Some(user_id) = str_field(&body, "discord_user_id") {
        let save = SaveGuess {
            user_id,
            username: str_field(&body, "username"),
            avatar: str_field(&body, "avatar"),
            guild_id: str_field(&body, "guild_id"),
            game_date: date.clone().unwrap_or_else(eastern_date_string),
            guess_count: body["guessCount"]
                .as_i64()
                .filter(|n| *n != 0)
                .and_then(|n| i32::try_from(n).ok())
                .unwrap_or(1),
            game_mode: str_field(&body, "gameMode").unwrap_or_else(|| "hard".into()),
            lat,
            lng,
            guess_name: guess_name.clone(),
            distance: distance_rounded,
            score,
            direction,
            won,
        };
        if let Err(e) = save_guess(&app, save, name_lookup).await {
            tracing::error!("Failed to save guess: {e}");
        }
    }

    let mut result = json!({
        "lat": guess["lat"],
        "lng": guess["lng"],
        "distance": distance_rounded,
        "score": score,
        "bearing": js_round(bearing) as i64,
        "direction": direction,
        "timestamp": now_iso(),
        "address": null,
        "pendingName": needs_name,
        "completed": won,
        "won": won,
        "answer": if won {
            json!({
                "name": location.name,
                "lat": location.lat,
                "lng": location.lng,
                "country": location.country,
                "hints": location.hints,
            })
        } else {
            Value::Null
        },
    });
    if won && let Some(info) = app.place_info.get(&app.http, &location).await {
        result["answer"]["info"] = info;
    }
    if let Some(name) = guess.get("name").filter(|v| !v.is_null()) {
        result["guess"] = name.clone();
    }
    Json(result).into_response()
}

struct SaveGuess {
    user_id: String,
    username: Option<String>,
    avatar: Option<String>,
    guild_id: Option<String>,
    game_date: String,
    guess_count: i32,
    game_mode: String,
    lat: f64,
    lng: f64,
    guess_name: Option<String>,
    distance: i64,
    score: f64,
    direction: &'static str,
    won: bool,
}

async fn save_guess(
    app: &AppState,
    mut g: SaveGuess,
    name_lookup: Option<crate::geocode::GeoFuture>,
) -> Result<(), sqlx::Error> {
    if g.guild_id.is_none() {
        g.guild_id = sqlx::query_scalar(
            "SELECT guild_id FROM discord_users WHERE id = $1 AND guild_id IS NOT NULL",
        )
        .bind(&g.user_id)
        .fetch_optional(&app.db)
        .await?;
    }

    if g.guild_id.is_some() {
        sqlx::query(
            "INSERT INTO discord_users (id, username, avatar, guild_id) VALUES ($1, $2, $3, $4) \
             ON CONFLICT (id) DO UPDATE SET username = $2, avatar = $3, guild_id = $4",
        )
        .bind(&g.user_id)
        .bind(&g.username)
        .bind(&g.avatar)
        .bind(&g.guild_id)
        .execute(&app.db)
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO discord_users (id, username, avatar) VALUES ($1, $2, $3) \
             ON CONFLICT (id) DO UPDATE SET username = $2, avatar = $3",
        )
        .bind(&g.user_id)
        .bind(&g.username)
        .bind(&g.avatar)
        .execute(&app.db)
        .await?;
    }

    let guess_id: i32 = sqlx::query(
        "INSERT INTO user_guesses (user_id, date, guess_number, lat, lng, location_name, distance, score, direction, game_mode) \
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id",
    )
    .bind(&g.user_id)
    .bind(&g.game_date)
    .bind(g.guess_count)
    .bind(g.lat)
    .bind(g.lng)
    .bind(&g.guess_name)
    .bind(g.distance)
    .bind(g.score)
    .bind(g.direction)
    .bind(&g.game_mode)
    .fetch_one(&app.db)
    .await?
    .try_get("id")?;

    if let Some(lookup) = name_lookup {
        let db = app.db.clone();
        tokio::spawn(async move {
            let Some(result) = lookup.await else { return };
            let Some(name) = result.get("name").and_then(Value::as_str).filter(|s| !s.is_empty())
            else {
                return;
            };
            if let Err(e) = sqlx::query("UPDATE user_guesses SET location_name = $1 WHERE id = $2")
                .bind(name)
                .bind(guess_id)
                .execute(&db)
                .await
            {
                tracing::error!("Failed to save geocoded guess name: {e}");
            }
        });
    }

    if g.won
        && let Err(e) = save_win(app, &g).await
    {
        tracing::error!("Failed to save daily result or post message: {e}");
    }
    Ok(())
}

async fn save_win(app: &AppState, g: &SaveGuess) -> Result<(), sqlx::Error> {
    let easy_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM user_guesses WHERE user_id = $1 AND date = $2::date AND game_mode = 'easy'",
    )
    .bind(&g.user_id)
    .bind(&g.game_date)
    .fetch_one(&app.db)
    .await?;

    sqlx::query(
        "INSERT INTO daily_results (user_id, guild_id, date, score, guesses_count, won, game_mode, easy_guesses_count) \
         VALUES ($1, $2, $3::date, $4, $5, true, $6, $7) \
         ON CONFLICT (user_id, date) DO UPDATE SET score = $4, guesses_count = $5, won = true, \
         guild_id = $2, game_mode = $6, easy_guesses_count = $7",
    )
    .bind(&g.user_id)
    .bind(&g.guild_id)
    .bind(&g.game_date)
    .bind(g.distance)
    .bind(g.guess_count)
    .bind(&g.game_mode)
    .bind(easy_count)
    .execute(&app.db)
    .await?;

    // Discord posts don't affect the response; don't make the player wait
    if let Some(guild_id) = g.guild_id.clone() {
        let app = app.clone();
        let date = g.game_date.clone();
        tokio::spawn(async move {
            for channel_id in discord::registered_channels_for_guild(&app, &guild_id).await {
                discord::post_or_update_completion_message(&app, &channel_id, &guild_id, &date)
                    .await;
            }
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_coordinate_name;

    #[test]
    fn coordinate_names() {
        assert!(is_coordinate_name("48.8566, 2.3522"));
        assert!(is_coordinate_name("-33, -70.5"));
        assert!(!is_coordinate_name("Paris, France"));
        assert!(!is_coordinate_name("48.8566,2.3522"));
        assert!(!is_coordinate_name("48., 2.3"));
    }
}
