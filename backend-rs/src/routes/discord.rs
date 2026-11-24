use axum::{
    Json,
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use ed25519_dalek::Signature;
use serde_json::{Value, json};

use crate::{
    AppState, discord,
    util::{JsonBody, error, str_field},
};

/// Exchanges an OAuth code for a token and the user's profile.
pub async fn token(State(app): State<AppState>, JsonBody(body): JsonBody) -> Response {
    let Some(code) = str_field(&body, "code") else {
        return error(StatusCode::BAD_REQUEST, "Missing code");
    };

    let mut params = vec![
        ("client_id", app.config.discord_client_id.clone().unwrap_or_default()),
        ("client_secret", app.config.discord_client_secret.clone().unwrap_or_default()),
        ("grant_type", "authorization_code".into()),
        ("code", code),
    ];
    if let Some(uri) = str_field(&body, "redirect_uri") {
        params.push(("redirect_uri", uri.trim_end_matches('/').to_string()));
    }

    let res = match app
        .http
        .post(format!("{}/oauth2/token", app.discord.api_base()))
        .form(&params)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("token exchange request failed: {e}");
            return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
        }
    };
    let status = res.status();
    let data: Value = match res.json().await {
        Ok(d) => d,
        Err(e) => {
            tracing::error!("token exchange returned invalid JSON: {e}");
            return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
        }
    };
    if !status.is_success() {
        let sent: Vec<_> = params
            .iter()
            .map(|(k, v)| match *k {
                "client_secret" | "code" => (*k, "[REDACTED]".to_string()),
                _ => (*k, v.clone()),
            })
            .collect();
        tracing::error!("Discord token exchange failed: status {status}, response {data}, sent {sent:?}");
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to exchange token");
    }

    let access_token = data["access_token"].as_str().unwrap_or_default().to_string();
    let user: Value = match app
        .http
        .get(format!("{}/users/@me", app.discord.api_base()))
        .bearer_auth(&access_token)
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => match r.json().await {
            Ok(u) => u,
            Err(e) => {
                tracing::error!("user profile was invalid JSON: {e}");
                return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
            }
        },
        _ => {
            tracing::error!("Failed to fetch Discord user profile");
            return error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch user profile");
        }
    };

    if let Err(e) = sqlx::query(
        "INSERT INTO discord_users (id, username, avatar) VALUES ($1, $2, $3) \
         ON CONFLICT (id) DO UPDATE SET username = $2, avatar = $3",
    )
    .bind(user["id"].as_str())
    .bind(user["username"].as_str())
    .bind(user["avatar"].as_str())
    .execute(&app.db)
    .await
    {
        tracing::error!("Failed to upsert Discord user: {e}");
    }

    Json(json!({ "access_token": access_token, "user": user })).into_response()
}

/// Posts the activity's "share result" message to the channel it runs in.
/// The caller proves who they are with their Discord access token, and must
/// be a member of the server the channel belongs to; otherwise anyone could
/// make the bot post anything to any channel it can see.
pub async fn post_result_message(State(app): State<AppState>, JsonBody(body): JsonBody) -> Response {
    let (Some(channel_id), Some(content)) = (str_field(&body, "channelId"), str_field(&body, "content"))
    else {
        return error(StatusCode::BAD_REQUEST, "Missing channelId or content");
    };
    let Some(access_token) = str_field(&body, "access_token") else {
        return error(StatusCode::UNAUTHORIZED, "Missing access token");
    };
    if channel_id.is_empty() || !channel_id.bytes().all(|b| b.is_ascii_digit()) {
        return error(StatusCode::BAD_REQUEST, "Invalid channelId");
    }
    // Discord's own limit; checked here so we don't spend API calls first
    if content.chars().count() > 2000 {
        return error(StatusCode::BAD_REQUEST, "Message is too long");
    }
    let failed = |what: &str, e: &dyn std::fmt::Display| {
        tracing::error!("post-result-message: {what}: {e}");
        error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to send message")
    };
    if !app.discord.enabled() {
        return failed("bot not configured", &"no DISCORD_BOT_TOKEN");
    }

    let user_id = match app.discord.token_user_id(&access_token).await {
        Ok(id) => id,
        Err(e) if e.status == Some(StatusCode::UNAUTHORIZED) => {
            return error(StatusCode::UNAUTHORIZED, "Invalid access token");
        }
        Err(e) => return failed("checking access token", &e),
    };
    let guild_id = match app.discord.channel_guild_id(&channel_id).await {
        Ok(Some(g)) => g,
        Ok(None) => return error(StatusCode::FORBIDDEN, "Can't post to this channel"),
        Err(e) => return failed(&format!("looking up channel {channel_id}"), &e),
    };
    match app.discord.is_guild_member(&guild_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => {
            tracing::warn!(
                "post-result-message: user {user_id} is not in guild {guild_id} (channel {channel_id})"
            );
            return error(StatusCode::FORBIDDEN, "Not a member of this server");
        }
        Err(e) => return failed("checking guild membership", &e),
    }

    if discord::post_result_message(&app, &channel_id, &content, &user_id).await {
        Json(json!({ "status": "sent" })).into_response()
    } else {
        error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to send message")
    }
}

fn verify(app: &AppState, headers: &HeaderMap, body: &[u8]) -> bool {
    let Some(key) = &app.config.discord_public_key else { return false };
    let header = |name| headers.get(name).and_then(|v| v.to_str().ok());
    let (Some(sig_hex), Some(timestamp)) =
        (header("x-signature-ed25519"), header("x-signature-timestamp"))
    else {
        return false;
    };
    let Some(sig) = hex::decode(sig_hex)
        .ok()
        .and_then(|b| <[u8; 64]>::try_from(b).ok())
        .map(|b| Signature::from_bytes(&b))
    else {
        return false;
    };
    let mut message = Vec::with_capacity(timestamp.len() + body.len());
    message.extend_from_slice(timestamp.as_bytes());
    message.extend_from_slice(body);
    key.verify_strict(&message, &sig).is_ok()
}

/// Discord's HTTP interactions endpoint (slash commands and buttons). Set
/// "Interactions Endpoint URL" in the developer portal to `/api/interactions`.
pub async fn interactions(State(app): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    if app.config.discord_public_key.is_none() {
        return error(StatusCode::NOT_FOUND, "Interactions are not configured");
    }
    if !verify(&app, &headers, &body) {
        return (StatusCode::UNAUTHORIZED, "invalid request signature").into_response();
    }
    let Ok(interaction) = serde_json::from_slice::<Value>(&body) else {
        return (StatusCode::BAD_REQUEST, "invalid JSON").into_response();
    };

    let response = match interaction["type"].as_i64() {
        // PING
        Some(1) => json!({ "type": 1 }),
        // MESSAGE_COMPONENT
        Some(3) => {
            if interaction["data"]["custom_id"] == "play_locodle" {
                // LAUNCH_ACTIVITY
                json!({ "type": 12 })
            } else {
                // DEFERRED_UPDATE_MESSAGE: acknowledge, change nothing
                json!({ "type": 6 })
            }
        }
        // APPLICATION_COMMAND: defer, then fill in the reply
        Some(2) => {
            tokio::spawn(discord::run_command(app.clone(), interaction));
            json!({ "type": 5 })
        }
        _ => return (StatusCode::BAD_REQUEST, "unsupported interaction type").into_response(),
    };
    Json(response).into_response()
}
