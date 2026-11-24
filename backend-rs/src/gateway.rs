//! Minimal Discord gateway connection, only so the bot shows as online.
//!
//! Subscribes to no events (intents 0) and caches nothing. Commands and
//! buttons still arrive over HTTP at /api/interactions. This just identifies
//! with a presence, heartbeats, and resumes/reconnects per Discord's rules:
//! https://discord.com/developers/docs/events/gateway

use std::{sync::Arc, time::Duration};

use futures::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio::time::{Instant, interval_at, sleep};
use tokio_tungstenite::{
    Connector, connect_async_tls_with_config,
    tungstenite::{Message, protocol::WebSocketConfig},
};

const DEFAULT_URL: &str = "wss://gateway.discord.gg";
const QUERY: &str = "/?v=10&encoding=json";

/// State kept across connections so a dropped connection can resume.
#[derive(Default)]
struct Session {
    id: Option<String>,
    resume_url: Option<String>,
    seq: Option<i64>,
}

enum Next {
    /// Connect again, resuming if the session is still valid
    Reconnect,
    /// Something only a config change can fix (bad token, etc.)
    Stop(String),
}

/// A random fraction in [0, 1), for heartbeat and reconnect jitter.
fn jitter() -> f64 {
    use std::hash::{BuildHasher, RandomState};
    (RandomState::new().hash_one(std::time::SystemTime::now()) % 10_000) as f64 / 10_000.0
}

fn connector() -> Result<Connector, String> {
    use rustls_platform_verifier::ConfigVerifierExt;
    let config = rustls::ClientConfig::with_platform_verifier().map_err(|e| e.to_string())?;
    Ok(Connector::Rustls(Arc::new(config)))
}

pub fn spawn(token: String) {
    tokio::spawn(run(token));
}

async fn run(token: String) {
    let base = crate::config::var("DISCORD_GATEWAY_URL").unwrap_or_else(|| DEFAULT_URL.into());
    let mut session = Session::default();
    let mut backoff = Duration::from_secs(1);

    loop {
        let mut healthy = false;
        let url = session.resume_url.clone().unwrap_or_else(|| base.clone());
        match connect_once(&url, &token, &mut session, &mut healthy).await {
            Ok(Next::Stop(reason)) => {
                tracing::error!("gateway: giving up, bot will show offline: {reason}");
                return;
            }
            Ok(Next::Reconnect) => tracing::info!("gateway: reconnecting"),
            Err(e) => tracing::warn!("gateway: connection error: {e}"),
        }
        if healthy {
            backoff = Duration::from_secs(1);
        }
        sleep(backoff.mul_f64(1.0 + jitter())).await;
        backoff = (backoff * 2).min(Duration::from_secs(60));
    }
}

async fn connect_once(
    url: &str,
    token: &str,
    session: &mut Session,
    healthy: &mut bool,
) -> Result<Next, String> {
    // Gateway messages are tiny with no intents; cap buffers accordingly
    let config = WebSocketConfig::default().max_message_size(Some(1 << 20));
    let (ws, _) = connect_async_tls_with_config(
        format!("{}{QUERY}", url.trim_end_matches('/')),
        Some(config),
        true,
        Some(connector()?),
    )
    .await
    .map_err(|e| e.to_string())?;
    let (mut tx, mut rx) = ws.split();

    // 1. Hello: tells us the heartbeat interval
    let hello = loop {
        match rx.next().await {
            Some(Ok(Message::Text(t))) => break serde_json::from_str::<Value>(&t).map_err(|e| e.to_string())?,
            Some(Ok(_)) => continue,
            Some(Err(e)) => return Err(e.to_string()),
            None => return Err("closed before hello".into()),
        }
    };
    let interval_ms = hello["d"]["heartbeat_interval"].as_u64().ok_or("hello had no heartbeat_interval")?;
    let interval = Duration::from_millis(interval_ms);

    // 2. Resume the previous session if we have one, otherwise identify
    let opening = match (&session.id, session.seq) {
        (Some(id), Some(seq)) => json!({ "op": 6, "d": { "token": token, "session_id": id, "seq": seq } }),
        _ => json!({
            "op": 2,
            "d": {
                "token": token,
                "intents": 0,
                "properties": { "os": "linux", "browser": "locodle", "device": "locodle" },
                "presence": {
                    "since": null,
                    "activities": [{ "name": "Locodle", "type": 0 }],
                    "status": "online",
                    "afk": false
                }
            }
        }),
    };
    tx.send(Message::Text(opening.to_string().into())).await.map_err(|e| e.to_string())?;

    // 3. Heartbeat (first one after a random fraction of the interval) and
    //    handle what Discord sends
    let mut beat = interval_at(Instant::now() + interval.mul_f64(jitter()), interval);
    let mut acked = true;
    loop {
        tokio::select! {
            _ = beat.tick() => {
                if !acked {
                    // No ack since the last beat: the connection is dead
                    return Ok(Next::Reconnect);
                }
                acked = false;
                let hb = json!({ "op": 1, "d": session.seq });
                tx.send(Message::Text(hb.to_string().into())).await.map_err(|e| e.to_string())?;
            }
            msg = rx.next() => match msg {
                None => return Ok(Next::Reconnect),
                Some(Err(e)) => return Err(e.to_string()),
                Some(Ok(Message::Close(frame))) => {
                    let code = frame.as_ref().map(|f| u16::from(f.code)).unwrap_or(0);
                    let reason = frame.as_ref().map(|f| f.reason.to_string()).unwrap_or_default();
                    return Ok(match code {
                        // Authentication failed, invalid shard/API version/intents
                        4004 | 4010..=4014 => Next::Stop(format!("closed with {code}: {reason}")),
                        // Session can't be resumed: start a new one
                        4007 | 4009 => {
                            *session = Session::default();
                            Next::Reconnect
                        }
                        _ => {
                            tracing::info!("gateway: closed with {code} {reason}");
                            Next::Reconnect
                        }
                    });
                }
                Some(Ok(Message::Text(text))) => {
                    let Ok(payload) = serde_json::from_str::<Value>(&text) else { continue };
                    if let Some(s) = payload["s"].as_i64() {
                        session.seq = Some(s);
                    }
                    match payload["op"].as_i64() {
                        // Dispatch
                        Some(0) => match payload["t"].as_str() {
                            Some("READY") => {
                                let d = &payload["d"];
                                session.id = d["session_id"].as_str().map(str::to_owned);
                                session.resume_url = d["resume_gateway_url"].as_str().map(str::to_owned);
                                *healthy = true;
                                tracing::info!(
                                    "gateway: connected as {} (online, in {} servers)",
                                    d["user"]["username"].as_str().unwrap_or("?"),
                                    d["guilds"].as_array().map_or(0, Vec::len)
                                );
                            }
                            Some("RESUMED") => {
                                *healthy = true;
                                tracing::info!("gateway: session resumed");
                            }
                            _ => {}
                        },
                        // Discord asks for a heartbeat now
                        Some(1) => {
                            let hb = json!({ "op": 1, "d": session.seq });
                            tx.send(Message::Text(hb.to_string().into())).await.map_err(|e| e.to_string())?;
                        }
                        // Reconnect requested: resume on a new connection
                        Some(7) => return Ok(Next::Reconnect),
                        // Invalid session; `d` says whether it can be resumed
                        Some(9) => {
                            if payload["d"].as_bool() != Some(true) {
                                *session = Session::default();
                            }
                            sleep(Duration::from_secs_f64(1.0 + 4.0 * jitter())).await;
                            return Ok(Next::Reconnect);
                        }
                        // Heartbeat ack
                        Some(11) => acked = true,
                        _ => {}
                    }
                }
                Some(Ok(_)) => {}
            }
        }
    }
}
