//! Serves the built frontend, replacing the Caddy service:
//! - /assets/* (hashed filenames) cached for a year, everything else no-cache
//! - precompressed .br/.gz/.zst files when present, on-the-fly otherwise
//! - SPA fallback to index.html only for extensionless paths, so a missing
//!   /llms.txt is a real 404 rather than index.html with a 200

use std::{convert::Infallible, path::PathBuf};

use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    http::{HeaderValue, header},
    response::{IntoResponse, Response},
};
use tower::ServiceExt;
use tower_http::{
    compression::CompressionLayer,
    services::{ServeDir, ServeFile},
};

#[derive(Clone)]
struct Static {
    files: ServeDir,
    spa: ServeDir<ServeFile>,
}

pub fn service(dir: PathBuf) -> Router {
    let files = ServeDir::new(&dir)
        .precompressed_br()
        .precompressed_gzip()
        .precompressed_zstd();
    let spa = files.clone().fallback(ServeFile::new(dir.join("index.html")));
    Router::new()
        .fallback(serve)
        .layer(CompressionLayer::new())
        .with_state(Static { files, spa })
}

/// True when the last path segment has an extension (`\.[^/]+$`).
fn has_extension(path: &str) -> bool {
    let last = path.rsplit('/').next().unwrap_or("");
    last.len() > 1 && last[..last.len() - 1].contains('.')
}

async fn serve(State(s): State<Static>, req: Request) -> Response {
    let is_asset = req.uri().path().starts_with("/assets/");
    let result: Result<Response, Infallible> = if has_extension(req.uri().path()) {
        s.files.oneshot(req).await.map(|r| r.map(Body::new))
    } else {
        s.spa.oneshot(req).await.map(|r| r.map(Body::new))
    };
    let mut res = result.into_response();
    let cache = if is_asset { "public, max-age=31536000, immutable" } else { "no-cache" };
    res.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
    res
}

#[cfg(test)]
mod tests {
    use super::has_extension;

    #[test]
    fn extensions() {
        assert!(has_extension("/llms.txt"));
        assert!(has_extension("/.well-known/ai-catalog.json"));
        assert!(!has_extension("/"));
        assert!(!has_extension("/stats"));
        assert!(!has_extension("/a.b/c"));
        assert!(!has_extension("/trailing."));
    }
}
