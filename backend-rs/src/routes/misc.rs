use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::{
    Json,
    body::Body,
    extract::{Path, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

use crate::{
    AppState, locations,
    util::{JsonBody, error, now_iso, str_field},
};

pub async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "timestamp": now_iso() }))
}

pub async fn days(State(app): State<AppState>) -> Response {
    match locations::available_dates(&app.db).await {
        Ok(dates) => Json(json!({ "dates": dates })).into_response(),
        Err(e) => {
            tracing::error!("days: {e}");
            error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to load available dates")
        }
    }
}

/// Forwards analytics events from the Discord activity (where gtag can't
/// load) to GA4's Measurement Protocol.
pub async fn analytics(State(app): State<AppState>, JsonBody(body): JsonBody) -> Json<Value> {
    let Some(secret) = &app.config.ga_api_secret else {
        return Json(json!({ "status": "skipped", "reason": "no_api_secret" }));
    };
    let Some(params) = body.get("params").and_then(Value::as_object) else {
        tracing::error!("Analytics proxy error: missing params");
        return Json(json!({ "status": "error" }));
    };

    let mut params = params.clone();
    params.insert("engagement_time_msec".into(), json!(100));
    if !crate::util::truthy(params.get("session_id")) {
        let millis = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
        params.insert("session_id".into(), json!(millis.to_string()));
    }
    let payload = json!({
        "client_id": str_field(&body, "client_id").unwrap_or_else(|| "anonymous".into()),
        "events": [{ "name": body.get("event_name").cloned().unwrap_or(Value::Null), "params": params }],
    });

    let url = format!(
        "https://www.google-analytics.com/mp/collect?measurement_id={}&api_secret={secret}",
        app.config.ga_measurement_id
    );
    match app
        .http
        .post(url)
        .body(payload.to_string())
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        Ok(res) => {
            if !res.status().is_success() {
                tracing::error!("GA4 Error: {}", res.status());
            }
            Json(json!({ "status": "sent" }))
        }
        Err(e) => {
            tracing::error!("Analytics proxy error: {e}");
            Json(json!({ "status": "error" }))
        }
    }
}

/// Map tile proxy for the Discord activity, which can't load third-party
/// tile servers directly. Tries each provider in turn.
pub async fn tile(State(app): State<AppState>, Path((z, x, y)): Path<(String, String, String)>) -> Response {
    let (Ok(z), Ok(x), Ok(y)) = (z.parse::<u32>(), x.parse::<u32>(), y.parse::<u32>()) else {
        return (StatusCode::BAD_REQUEST, "Invalid tile coordinates").into_response();
    };

    let providers = [
        (
            "Esri WorldStreetMap",
            format!("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"),
        ),
        ("OpenStreetMap", format!("https://tile.openstreetmap.org/{z}/{x}/{y}.png")),
        ("CartoDB Voyager", format!("https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png")),
        ("CartoDB Positron", format!("https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png")),
    ];

    for (i, (name, url)) in providers.iter().enumerate() {
        let attempt = async {
            let res = app
                .http
                .get(url)
                .header(header::USER_AGENT, "Locodle/1.0")
                .timeout(Duration::from_secs(8))
                .send()
                .await
                .map_err(|e| e.to_string())?;
            if !res.status().is_success() {
                return Err(format!("HTTP {}", res.status().as_u16()));
            }
            let content_type = res
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .filter(|t| t.starts_with("image/"))
                .unwrap_or("image/png")
                .to_string();
            let bytes = res.bytes().await.map_err(|e| e.to_string())?;
            Ok((content_type, bytes))
        };
        match attempt.await {
            Ok((content_type, bytes)) => {
                if i > 0 {
                    tracing::warn!("Tile proxy used fallback provider: {name} for tile {z}/{x}/{y}");
                }
                return (
                    [
                        (header::CONTENT_TYPE, content_type),
                        (header::CACHE_CONTROL, "public, max-age=86400".to_string()),
                    ],
                    Body::from(bytes),
                )
                    .into_response();
            }
            Err(e) => tracing::warn!("Tile provider {name} failed for {z}/{x}/{y}: {e}"),
        }
    }
    tracing::error!("All tile providers failed for {z}/{x}/{y}");
    (StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch tile from all providers").into_response()
}
