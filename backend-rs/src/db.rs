use std::time::Duration;

use sqlx::{
    PgPool,
    postgres::{PgConnectOptions, PgPoolOptions},
};

pub async fn connect(url: &str) -> Result<PgPool, sqlx::Error> {
    // sslmode defaults to "prefer": TLS without certificate verification when
    // the server offers it, plain otherwise. That matches the Node backend's
    // `rejectUnauthorized: false` in production and plain connections locally.
    let options: PgConnectOptions = url.parse()?;
    PgPoolOptions::new()
        .max_connections(5)
        .min_connections(0)
        .idle_timeout(Duration::from_secs(300))
        .acquire_timeout(Duration::from_secs(10))
        .connect_with(options)
        .await
}

const MIGRATIONS: &[(&str, &str)] = &[
    ("001_init.sql", include_str!("../migrations/001_init.sql")),
    ("002_discord_leaderboard.sql", include_str!("../migrations/002_discord_leaderboard.sql")),
    ("003_user_guesses.sql", include_str!("../migrations/003_user_guesses.sql")),
    ("004_discord_channels.sql", include_str!("../migrations/004_discord_channels.sql")),
    ("005_location_game_date.sql", include_str!("../migrations/005_location_game_date.sql")),
    ("006_completion_messages.sql", include_str!("../migrations/006_completion_messages.sql")),
    ("007_robust_daily_challenges.sql", include_str!("../migrations/007_robust_daily_challenges.sql")),
    ("008_server_streaks.sql", include_str!("../migrations/008_server_streaks.sql")),
    ("009_game_mode_tracking.sql", include_str!("../migrations/009_game_mode_tracking.sql")),
    ("010_easy_guesses_count.sql", include_str!("../migrations/010_easy_guesses_count.sql")),
];

/// Same behaviour as the old `npm run init-db`: every script is idempotent and
/// runs on each invocation. A failing base schema is fatal; a failing later
/// migration is logged and skipped.
pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::Error> {
    for (index, (name, sql)) in MIGRATIONS.iter().enumerate() {
        match sqlx::raw_sql(*sql).execute(pool).await {
            Ok(_) => tracing::info!("migration {name} applied"),
            Err(err) if index == 0 => return Err(err),
            Err(err) => tracing::warn!("migration {name} failed: {err}"),
        }
    }
    Ok(())
}
