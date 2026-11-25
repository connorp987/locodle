//! Post-game "about this place": a photo, a short summary and a link, from the
//! location's English Wikipedia article. Only ever sent alongside a revealed
//! answer, so it can't spoil today's location.

use std::{collections::HashMap, sync::Mutex, time::Duration};

use axum::{
    body::Body,
    extract::{Query, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{AppState, hints, locations::Location};

const USER_AGENT: &str = "Locodle/1.0";
/// Where Wikipedia serves article images from (thumbnails moved to thumb.).
const IMAGE_HOSTS: [&str; 2] = ["https://upload.wikimedia.org/", "https://thumb.wikimedia.org/"];

fn is_wikimedia_image(url: &str) -> bool {
    IMAGE_HOSTS.iter().any(|h| url.starts_with(h)) && !url.contains("..")
}
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;

/// Location id -> info (`None` when the place has no article or the article
/// has nothing usable). Network failures aren't cached, so they're retried.
#[derive(Default)]
pub struct Cache(Mutex<HashMap<i32, Option<Value>>>);

impl Cache {
    /// Info for a location, or `None` if there isn't any or Wikipedia is slow.
    pub async fn get(&self, http: &reqwest::Client, loc: &Location) -> Option<Value> {
        if let Some(hit) = self.0.lock().unwrap().get(&loc.id) {
            return hit.clone();
        }
        let title = article_title(&loc.name, &loc.country)?;
        match fetch(http, &title).await {
            Ok(info) => {
                self.0.lock().unwrap().insert(loc.id, info.clone());
                info
            }
            Err(e) => {
                tracing::warn!("place info for {title}: {e}");
                None
            }
        }
    }
}

/// The article recorded for this place in the template pool. Places that
/// aren't in the pool (the old seed rows) have none, rather than guessing from
/// a name like "Santiago".
fn article_title(name: &str, country: &str) -> Option<String> {
    hints::templates()
        .into_iter()
        .find(|t| t.name == name && t.country == country)
        .and_then(|t| t.wiki)
}

async fn fetch(http: &reqwest::Client, title: &str) -> Result<Option<Value>, String> {
    let url = reqwest::Url::parse_with_params(
        "https://en.wikipedia.org/w/api.php",
        [
            ("action", "query"),
            ("format", "json"),
            ("formatversion", "2"),
            ("redirects", "1"),
            ("prop", "extracts|pageimages|info"),
            ("exintro", "1"),
            ("explaintext", "1"),
            ("exsentences", "3"),
            ("piprop", "thumbnail"),
            ("pithumbsize", "800"),
            ("inprop", "url"),
            ("titles", title),
        ],
    )
    .map_err(|e| e.to_string())?;
    let res = http
        .get(url)
        .header(header::USER_AGENT, USER_AGENT)
        .timeout(Duration::from_secs(4))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status().as_u16()));
    }
    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(parse(&body))
}

fn parse(body: &Value) -> Option<Value> {
    let page = body.pointer("/query/pages/0")?;
    if page.get("missing").is_some() {
        return None;
    }
    let summary = page
        .get("extract")
        .and_then(Value::as_str)
        .map(clean_summary)
        .filter(|s| !s.is_empty())?;
    let image = page
        .pointer("/thumbnail/source")
        .and_then(Value::as_str)
        .filter(|s| is_wikimedia_image(s));
    Some(json!({
        "title": page.get("title"),
        "summary": summary,
        "image": image,
        "url": page.get("fullurl"),
    }))
}

/// Drops the pronunciation and etymology asides that plain-text extracts mangle,
/// e.g. "A cenote (English:   or , sih-NO-tee; Spanish: [seˈnote]) is ...".
/// Plain asides like "(also Kiev)" stay.
fn clean_summary(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut group = String::new();
    let mut depth = 0usize;
    for c in text.chars() {
        match c {
            '(' => {
                if depth > 0 {
                    group.push(c);
                }
                depth += 1;
            }
            ')' if depth > 0 => {
                depth -= 1;
                if depth > 0 {
                    group.push(c);
                    continue;
                }
                let letters = group.chars().filter(|c| c.is_alphabetic()).count();
                let aside = group.contains([':', ';', '[', 'ˈ']) || letters < 3;
                if aside {
                    // Drop the space before the group so "cenote (…) is" -> "cenote is".
                    while out.ends_with(' ') {
                        out.pop();
                    }
                } else {
                    out.push('(');
                    out.push_str(&group);
                    out.push(')');
                }
                group.clear();
            }
            _ if depth > 0 => group.push(c),
            _ => out.push(c),
        }
    }
    if depth > 0 {
        // Unbalanced: keep the text as it was.
        out.push('(');
        out.push_str(&group);
    }
    let mut cleaned = String::with_capacity(out.len());
    for word in out.split_whitespace() {
        if !cleaned.is_empty() && !word.starts_with([',', '.', ';']) {
            cleaned.push(' ');
        }
        cleaned.push_str(word);
    }
    cleaned
}

#[derive(Deserialize)]
pub struct ImageQuery {
    src: String,
}

/// `GET /api/wiki-image?src=`: proxies a Wikimedia image, because Discord's
/// CSP blocks Wikimedia inside the activity. Only Wikimedia image hosts.
pub async fn image(State(app): State<AppState>, Query(q): Query<ImageQuery>) -> Response {
    if !is_wikimedia_image(&q.src) {
        return (StatusCode::BAD_REQUEST, "Unsupported image").into_response();
    }
    let res = match app
        .http
        .get(&q.src)
        .header(header::USER_AGENT, USER_AGENT)
        .timeout(Duration::from_secs(8))
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => return (StatusCode::BAD_GATEWAY, format!("HTTP {}", r.status().as_u16())).into_response(),
        Err(e) => {
            tracing::warn!("wiki image proxy: {e}");
            return (StatusCode::BAD_GATEWAY, "Image unavailable").into_response();
        }
    };
    let Some(content_type) = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .filter(|t| t.starts_with("image/"))
        .map(str::to_owned)
    else {
        return (StatusCode::BAD_GATEWAY, "Not an image").into_response();
    };
    if res.content_length().is_some_and(|n| n as usize > MAX_IMAGE_BYTES) {
        return (StatusCode::BAD_GATEWAY, "Image too large").into_response();
    }
    match res.bytes().await {
        Ok(bytes) if bytes.len() <= MAX_IMAGE_BYTES => (
            [
                (header::CONTENT_TYPE, content_type),
                (header::CACHE_CONTROL, "public, max-age=604800".to_owned()),
            ],
            Body::from(bytes),
        )
            .into_response(),
        _ => (StatusCode::BAD_GATEWAY, "Image unavailable").into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_an_article() {
        let body = json!({"query": {"pages": [{
            "title": "Tikal",
            "extract": "Tikal is the ruin of an ancient city. ",
            "thumbnail": {"source": "https://thumb.wikimedia.org/a/b/960px-Tikal.jpg?utm_source=x"},
            "fullurl": "https://en.wikipedia.org/wiki/Tikal"
        }]}});
        let info = parse(&body).unwrap();
        assert_eq!(info["summary"], "Tikal is the ruin of an ancient city.");
        assert_eq!(info["image"], "https://thumb.wikimedia.org/a/b/960px-Tikal.jpg?utm_source=x");
        assert_eq!(info["url"], "https://en.wikipedia.org/wiki/Tikal");
    }

    #[test]
    fn strips_pronunciation_asides() {
        assert_eq!(
            clean_summary(
                "A cenote (English:   or , sih-NO-tee or seh-NO-tay; Latin American Spanish: [seˈnote]) is a natural pit."
            ),
            "A cenote is a natural pit."
        );
        assert_eq!(clean_summary("Kyiv (also Kiev) is the capital."), "Kyiv (also Kiev) is the capital.");
        assert_eq!(clean_summary("Tikal ( ) is a ruin , in Guatemala."), "Tikal is a ruin, in Guatemala.");
        assert_eq!(clean_summary("Unclosed (aside here"), "Unclosed (aside here");
    }

    #[test]
    fn missing_or_empty_articles_give_nothing() {
        assert!(parse(&json!({"query": {"pages": [{"title": "X", "missing": true}]}})).is_none());
        assert!(parse(&json!({"query": {"pages": [{"title": "X", "extract": " "}]}})).is_none());
    }

    #[test]
    fn ignores_images_from_other_hosts() {
        let body = json!({"query": {"pages": [{
            "title": "X", "extract": "Text.", "thumbnail": {"source": "https://evil.example/x.jpg"}
        }]}});
        assert!(parse(&body).unwrap()["image"].is_null());
    }
}
