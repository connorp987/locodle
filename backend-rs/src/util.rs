//! Small helpers: Eastern-time dates, JS-compatible formatting, and lenient
//! JSON field access that mirrors how the old Node handlers read bodies.

use axum::{
    Json,
    body::Bytes,
    extract::{FromRequest, Request},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use chrono::{DateTime, NaiveDate, Utc};
use chrono_tz::America::New_York;
use serde_json::{Value, json};

pub fn eastern_date_of(t: DateTime<Utc>) -> String {
    t.with_timezone(&New_York).format("%Y-%m-%d").to_string()
}

pub fn eastern_date_string() -> String {
    eastern_date_of(Utc::now())
}

/// `Date.prototype.toISOString()` format.
pub fn iso_millis(t: DateTime<Utc>) -> String {
    t.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

pub fn now_iso() -> String {
    iso_millis(Utc::now())
}

/// How node-postgres serialised a DATE column on a UTC server: midnight UTC.
pub fn date_as_js_json(d: NaiveDate) -> String {
    format!("{}T00:00:00.000Z", d.format("%Y-%m-%d"))
}

/// `Math.round`: halves round towards +infinity.
pub fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}

/// JavaScript truthiness for a JSON value.
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

/// A truthy string (or number, stringified) field.
pub fn str_field(obj: &Value, key: &str) -> Option<String> {
    match obj.get(key) {
        Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}

/// A numeric field, accepting numeric strings like JS arithmetic would.
pub fn num_field(obj: &Value, key: &str) -> Option<f64> {
    match obj.get(key) {
        Some(Value::Number(n)) => n.as_f64(),
        Some(Value::String(s)) => s.trim().parse().ok(),
        _ => None,
    }
}

/// `{ error: message }` with a status code.
pub fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

/// A JSON request body parsed into a `Value`, so handlers can read fields
/// leniently instead of rejecting mismatched types with 422s.
pub struct JsonBody(pub Value);

impl<S: Send + Sync> FromRequest<S> for JsonBody {
    type Rejection = Response;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let bytes = Bytes::from_request(req, state)
            .await
            .map_err(IntoResponse::into_response)?;
        serde_json::from_slice(&bytes)
            .map(JsonBody)
            .map_err(|_| error(StatusCode::BAD_REQUEST, "Invalid JSON body"))
    }
}
