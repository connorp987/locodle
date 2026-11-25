mod challenge;
mod discord;
mod misc;
mod user;

use std::{sync::Arc, time::Instant};

use axum::{
    Json, Router,
    extract::Request,
    http::{HeaderValue, Method, StatusCode, Uri, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{any, get, post},
};
use tower_http::{
    cors::{AllowHeaders, AllowOrigin, CorsLayer},
    set_header::SetResponseHeaderLayer,
};

use crate::{AppState, rate_limit::RateLimiter, static_files};

pub fn router(app: AppState) -> Router {
    let limiter = Arc::new(RateLimiter::new(80, std::time::Duration::from_secs(60)));
    limiter.spawn_cleanup();

    // Rate-limited API routes
    let api = Router::new()
        .route("/api/health", get(misc::health))
        .route("/api/days", get(misc::days))
        .route("/api/daily-challenge", get(challenge::daily_challenge))
        .route("/api/geocode", get(challenge::geocode))
        .route("/api/guess", post(challenge::guess))
        .route("/api/user/{user_id}/stats", get(user::stats))
        .route("/api/user/{user_id}/guesses/{date}", get(user::guesses))
        .route("/api/token", post(discord::token))
        .route("/api/post-result-message", post(discord::post_result_message))
        .route("/api/analytics", post(misc::analytics))
        .route("/api/wiki-image", get(crate::place_info::image))
        .layer(middleware::from_fn_with_state(limiter, crate::rate_limit::middleware));

    // Not rate limited: a map view loads dozens of tiles, and Discord's
    // interaction calls must never be rejected.
    let unlimited = Router::new()
        .route("/api/tiles/{z}/{x}/{y}", get(misc::tile))
        .route("/api/interactions", post(discord::interactions))
        .route("/health", get(|| async { StatusCode::OK }))
        // Unknown API paths get a JSON 404, not the SPA's index.html
        .route("/api/{*rest}", any(api_not_found));

    let mut router = api.merge(unlimited).layer(cors(&app)).layer(middleware::from_fn(log_api));

    router = match &app.config.static_dir {
        Some(dir) => router.fallback_service(static_files::service(dir.clone())),
        None => router.fallback(|| async { StatusCode::NOT_FOUND }),
    };

    router
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .with_state(app)
}

fn cors(app: &AppState) -> CorsLayer {
    let mut allowed: Vec<String> = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://dependable-rebirth-production-4f9e.up.railway.app",
        "https://locodle.com",
        "https://www.locodle.com",
    ]
    .map(String::from)
    .to_vec();
    allowed.extend(app.config.frontend_url.clone());

    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(move |origin: &HeaderValue, _| {
            origin.to_str().is_ok_and(|o| {
                allowed.iter().any(|a| a == o) || o.ends_with(".discordsays.com")
            })
        }))
        .allow_methods([
            Method::GET,
            Method::HEAD,
            Method::PUT,
            Method::PATCH,
            Method::POST,
            Method::DELETE,
        ])
        .allow_headers(AllowHeaders::mirror_request())
}

async fn api_not_found(method: Method, uri: Uri) -> Response {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({
            "message": format!("Route {method}:{} not found", uri.path()),
            "error": "Not Found",
            "statusCode": 404,
        })),
    )
        .into_response()
}

/// One log line per API request (static files and tiles stay quiet).
async fn log_api(req: Request, next: Next) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_owned();
    let start = Instant::now();
    let res = next.run(req).await;
    if path.starts_with("/api/") && !path.starts_with("/api/tiles/") {
        tracing::info!(
            "{method} {path} {} {:.1}ms",
            res.status().as_u16(),
            start.elapsed().as_secs_f64() * 1000.0
        );
    }
    res
}
