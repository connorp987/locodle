//! Fixed-window rate limit per client IP (80 requests / 60s, as before).

use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use axum::{
    Json,
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde_json::json;

pub struct RateLimiter {
    max: u32,
    window: Duration,
    windows: Mutex<HashMap<IpAddr, (Instant, u32)>>,
}

impl RateLimiter {
    pub fn new(max: u32, window: Duration) -> Self {
        Self { max, window, windows: Mutex::default() }
    }

    /// Counts a request. Ok(remaining) or Err(seconds until reset); both
    /// carry the seconds until the window resets.
    fn hit(&self, ip: IpAddr) -> (bool, u32, u64) {
        let now = Instant::now();
        let mut windows = self.windows.lock().unwrap();
        let entry = windows.entry(ip).or_insert((now, 0));
        if now.duration_since(entry.0) >= self.window {
            *entry = (now, 0);
        }
        entry.1 += 1;
        let reset = self.window.saturating_sub(now.duration_since(entry.0)).as_secs().max(1);
        (entry.1 <= self.max, self.max.saturating_sub(entry.1), reset)
    }

    /// Drops expired windows once a minute so the map doesn't grow.
    pub fn spawn_cleanup(self: &Arc<Self>) {
        let this = Arc::downgrade(self);
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(60));
            loop {
                tick.tick().await;
                let Some(this) = this.upgrade() else { return };
                let now = Instant::now();
                this.windows
                    .lock()
                    .unwrap()
                    .retain(|_, (start, _)| now.duration_since(*start) < this.window);
            }
        });
    }
}

/// The client's IP. Behind Railway's proxy the socket peer is the proxy, so
/// use the address it reports (X-Real-IP, else the last X-Forwarded-For hop).
fn client_ip(headers: &HeaderMap, peer: Option<SocketAddr>) -> Option<IpAddr> {
    let header = |name| headers.get(name).and_then(|v| v.to_str().ok());
    header("x-real-ip")
        .and_then(|v| v.trim().parse().ok())
        .or_else(|| {
            header("x-forwarded-for")
                .and_then(|v| v.rsplit(',').next())
                .and_then(|v| v.trim().parse().ok())
        })
        .or(peer.map(|p| p.ip()))
}

pub async fn middleware(State(limiter): State<Arc<RateLimiter>>, req: Request, next: Next) -> Response {
    let peer = req.extensions().get::<ConnectInfo<SocketAddr>>().map(|c| c.0);
    let Some(ip) = client_ip(req.headers(), peer) else {
        return next.run(req).await;
    };

    let (allowed, remaining, reset) = limiter.hit(ip);
    let mut res = if allowed {
        next.run(req).await
    } else {
        let mut res = (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({
                "statusCode": 429,
                "error": "Too Many Requests",
                "message": "Rate limit exceeded, retry in 1 minute",
            })),
        )
            .into_response();
        res.headers_mut().insert("retry-after", HeaderValue::from(reset));
        res
    };
    let h = res.headers_mut();
    h.insert("x-ratelimit-limit", HeaderValue::from(limiter.max));
    h.insert("x-ratelimit-remaining", HeaderValue::from(remaining));
    h.insert("x-ratelimit-reset", HeaderValue::from(reset));
    res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits_per_ip() {
        let rl = RateLimiter::new(2, Duration::from_secs(60));
        let a: IpAddr = "1.1.1.1".parse().unwrap();
        let b: IpAddr = "2.2.2.2".parse().unwrap();
        assert!(rl.hit(a).0);
        assert!(rl.hit(a).0);
        assert!(!rl.hit(a).0);
        assert!(rl.hit(b).0);
    }

    #[test]
    fn prefers_proxy_headers() {
        let mut h = HeaderMap::new();
        h.insert("x-forwarded-for", "9.9.9.9, 3.3.3.3".parse().unwrap());
        assert_eq!(client_ip(&h, None), Some("3.3.3.3".parse().unwrap()));
        h.insert("x-real-ip", "4.4.4.4".parse().unwrap());
        assert_eq!(client_ip(&h, None), Some("4.4.4.4".parse().unwrap()));
    }
}
