mod calc;
mod config;
mod db;
mod discord;
mod gateway;
mod geocode;
mod hints;
mod locations;
mod rate_limit;
mod routes;
mod scheduler;
mod static_files;
mod util;

use std::{net::SocketAddr, process::ExitCode, sync::Arc, time::Duration};

use sqlx::PgPool;

pub struct App {
    pub config: config::Config,
    pub db: PgPool,
    pub http: reqwest::Client,
    pub locations: locations::LocationCache,
    pub geocoder: Arc<geocode::Geocoder>,
    pub discord: discord::Discord,
}

pub type AppState = Arc<App>;

#[tokio::main(flavor = "multi_thread", worker_threads = 2)]
async fn main() -> ExitCode {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sqlx=warn".into()),
        )
        .with_target(false)
        .with_ansi(std::io::IsTerminal::is_terminal(&std::io::stdout()))
        .init();

    if let Err(e) = run().await {
        tracing::error!("{e}");
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    rustls::crypto::ring::default_provider()
        .install_default()
        .map_err(|_| "failed to install TLS crypto provider")?;

    let config = config::Config::from_env()?;
    let db = db::connect(&config.database_url).await?;

    // `locodle-server migrate`: apply the schema and exit (was `npm run init-db`)
    if std::env::args().nth(1).as_deref() == Some("migrate") {
        db::migrate(&db).await?;
        tracing::info!("database initialization complete");
        return Ok(());
    }
    if config.run_migrations {
        db::migrate(&db).await?;
    }
    sqlx::query("SELECT NOW()").execute(&db).await?;
    tracing::info!("database connection successful");

    let http = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .pool_idle_timeout(Duration::from_secs(60))
        .pool_max_idle_per_host(4)
        .build()?;

    let app: AppState = Arc::new(App {
        discord: discord::Discord::new(http.clone(), config.discord_bot_token.clone()),
        locations: locations::LocationCache::default(),
        geocoder: Arc::default(),
        http,
        db,
        config,
    });

    start_background_jobs(&app);

    let addr = SocketAddr::from(([0, 0, 0, 0], app.config.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    match &app.config.static_dir {
        Some(dir) => tracing::info!("serving frontend from {}", dir.display()),
        None => tracing::info!("no frontend build found; serving the API only"),
    }
    tracing::info!("Locodle backend running on http://localhost:{}", app.config.port);

    let pool = app.db.clone();
    axum::serve(
        listener,
        routes::router(app).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    pool.close().await;
    Ok(())
}

fn start_background_jobs(app: &AppState) {
    // Pre-generate today's location just after midnight Eastern
    let a = app.clone();
    scheduler::daily("location pre-generation", 0, 15, move || {
        let a = a.clone();
        async move {
            match a.locations.daily(&a.db, None).await {
                Ok(Some(l)) => tracing::info!("today's location is ready: {}", l.name),
                Ok(None) => tracing::error!("failed to pre-generate today's location"),
                Err(e) => tracing::error!("failed to pre-generate today's location: {e}"),
            }
        }
    });

    if !app.discord.enabled() {
        tracing::warn!("No DISCORD_BOT_TOKEN found; Discord posting and summaries are disabled.");
        return;
    }
    if app.config.discord_public_key.is_none() {
        tracing::warn!("No DISCORD_PUBLIC_KEY; /api/interactions (slash commands, Play button) is disabled.");
    }

    // Presence only, so the bot shows as online
    if let Some(token) = app.config.discord_bot_token.clone() {
        gateway::spawn(token);
    }

    let a = app.clone();
    tokio::spawn(async move {
        if let Err(e) = a.discord.register_commands().await {
            tracing::error!("Failed to register commands: {e}");
        }
    });

    let hour = app.config.summary_hour.parse().unwrap_or(9);
    let minute = app.config.summary_minute.parse().unwrap_or(30);
    let a = app.clone();
    scheduler::daily("daily Discord summary", hour, minute, move || {
        discord::post_daily_summary_to_all_channels(a.clone())
    });
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("shutting down");
}
