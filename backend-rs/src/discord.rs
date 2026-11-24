//! Discord bot features over plain REST + HTTP interactions (no gateway
//! connection or cache). Replaces discord.js.

use std::{fmt, time::Duration};

use chrono::{NaiveDate, Utc};
use reqwest::{Method, StatusCode};
use serde_json::{Value, json};
use sqlx::Row;

use crate::{
    AppState,
    util::{eastern_date_of, eastern_date_string},
};

const DEFAULT_API: &str = "https://discord.com/api/v10";
const USER_AGENT: &str = "DiscordBot (https://locodle.com, 1.0)";

pub struct Discord {
    http: reqwest::Client,
    token: Option<String>,
    /// DISCORD_API_BASE overrides this, for testing against a mock server
    api: String,
}

/// How a request to Discord authenticates.
#[derive(Clone, Copy)]
enum Auth<'a> {
    /// The bot token
    Bot,
    /// A player's OAuth access token
    Bearer(&'a str),
    /// None (interaction webhooks carry their own token in the path)
    None,
}

#[derive(Debug)]
pub struct DiscordError {
    pub status: Option<StatusCode>,
    /// Discord's JSON error code (e.g. 50001 Missing Access)
    pub code: Option<i64>,
    pub message: String,
}

impl fmt::Display for DiscordError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match (self.status, self.code) {
            (Some(s), Some(c)) => write!(f, "{s} (code {c}): {}", self.message),
            (Some(s), None) => write!(f, "{s}: {}", self.message),
            _ => f.write_str(&self.message),
        }
    }
}

impl std::error::Error for DiscordError {}

impl DiscordError {
    fn msg(message: impl Into<String>) -> Self {
        Self { status: None, code: None, message: message.into() }
    }
}

/// Snowflake IDs are digits only. Checking keeps client-supplied IDs from
/// steering bot-authenticated requests to other API paths.
fn snowflake(id: &str) -> Result<&str, DiscordError> {
    if !id.is_empty() && id.len() <= 25 && id.bytes().all(|b| b.is_ascii_digit()) {
        Ok(id)
    } else {
        Err(DiscordError::msg(format!("invalid Discord id {id:?}")))
    }
}

pub fn play_button_row() -> Value {
    json!([{
        "type": 1,
        "components": [{
            "type": 2,
            "style": 1,
            "label": "Play Today's Challenge",
            "custom_id": "play_locodle",
            "emoji": { "name": "🌍" }
        }]
    }])
}

impl Discord {
    pub fn new(http: reqwest::Client, token: Option<String>) -> Self {
        let api = crate::config::var("DISCORD_API_BASE")
            .map(|a| a.trim_end_matches('/').to_string())
            .unwrap_or_else(|| DEFAULT_API.to_string());
        Self { http, token, api }
    }

    pub fn api_base(&self) -> &str {
        &self.api
    }

    pub fn enabled(&self) -> bool {
        self.token.is_some()
    }

    async fn request(
        &self,
        method: Method,
        path: &str,
        body: Option<&Value>,
        auth: Auth<'_>,
    ) -> Result<Value, DiscordError> {
        let authorization = match (auth, &self.token) {
            (Auth::Bot, Some(t)) => Some(format!("Bot {t}")),
            (Auth::Bot, None) => return Err(DiscordError::msg("bot not configured")),
            (Auth::Bearer(t), _) => Some(format!("Bearer {t}")),
            (Auth::None, _) => None,
        };

        for attempt in 0..2 {
            let mut req = self
                .http
                .request(method.clone(), format!("{}{path}", self.api))
                .header(reqwest::header::USER_AGENT, USER_AGENT)
                .timeout(Duration::from_secs(10));
            if let Some(a) = &authorization {
                req = req.header(reqwest::header::AUTHORIZATION, a);
            }
            if let Some(b) = body {
                req = req.json(b);
            }

            let res = req.send().await.map_err(|e| DiscordError::msg(e.to_string()))?;
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            let parsed: Value = serde_json::from_str(&text).unwrap_or(Value::Null);

            if status == StatusCode::TOO_MANY_REQUESTS && attempt == 0 {
                let wait = parsed["retry_after"].as_f64().unwrap_or(1.0).clamp(0.0, 10.0);
                tracing::warn!("Discord rate limited on {path}, retrying in {wait}s");
                tokio::time::sleep(Duration::from_secs_f64(wait)).await;
                continue;
            }
            if status.is_success() {
                return Ok(parsed);
            }
            return Err(DiscordError {
                status: Some(status),
                code: parsed["code"].as_i64(),
                message: parsed["message"].as_str().unwrap_or(&text).to_string(),
            });
        }
        unreachable!("loop returns on the second attempt")
    }

    /// Sends a message and returns its id.
    pub async fn send_message(
        &self,
        channel_id: &str,
        content: &str,
        allowed_mentions: Option<Value>,
    ) -> Result<String, DiscordError> {
        let mut body = json!({ "content": content, "components": play_button_row() });
        if let Some(am) = allowed_mentions {
            body["allowed_mentions"] = am;
        }
        let path = format!("/channels/{}/messages", snowflake(channel_id)?);
        let msg = self.request(Method::POST, &path, Some(&body), Auth::Bot).await?;
        msg["id"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| DiscordError::msg("message response had no id"))
    }

    pub async fn delete_message(&self, channel_id: &str, message_id: &str) -> Result<(), DiscordError> {
        let path = format!(
            "/channels/{}/messages/{}",
            snowflake(channel_id)?,
            snowflake(message_id)?
        );
        self.request(Method::DELETE, &path, None, Auth::Bot).await.map(|_| ())
    }

    pub async fn guild_name(&self, guild_id: &str) -> Result<Option<String>, DiscordError> {
        let path = format!("/guilds/{}", snowflake(guild_id)?);
        let guild = self.request(Method::GET, &path, None, Auth::Bot).await?;
        Ok(guild["name"].as_str().map(str::to_owned))
    }

    /// The id of the user an OAuth access token belongs to.
    pub async fn token_user_id(&self, access_token: &str) -> Result<String, DiscordError> {
        let user = self.request(Method::GET, "/users/@me", None, Auth::Bearer(access_token)).await?;
        user["id"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| DiscordError::msg("user response had no id"))
    }

    /// The guild a channel belongs to (None for DMs and group DMs).
    pub async fn channel_guild_id(&self, channel_id: &str) -> Result<Option<String>, DiscordError> {
        let path = format!("/channels/{}", snowflake(channel_id)?);
        let channel = self.request(Method::GET, &path, None, Auth::Bot).await?;
        Ok(channel["guild_id"].as_str().map(str::to_owned))
    }

    /// Whether a user is a member of a guild the bot is in.
    pub async fn is_guild_member(&self, guild_id: &str, user_id: &str) -> Result<bool, DiscordError> {
        let path = format!("/guilds/{}/members/{}", snowflake(guild_id)?, snowflake(user_id)?);
        match self.request(Method::GET, &path, None, Auth::Bot).await {
            Ok(_) => Ok(true),
            // 10007 Unknown Member
            Err(e) if e.status == Some(StatusCode::NOT_FOUND) => Ok(false),
            Err(e) => Err(e),
        }
    }

    /// Replaces a deferred interaction response.
    pub async fn edit_original(
        &self,
        application_id: &str,
        interaction_token: &str,
        body: &Value,
    ) -> Result<(), DiscordError> {
        if interaction_token.is_empty() || interaction_token.contains(['/', '?', '#']) {
            return Err(DiscordError::msg("invalid interaction token"));
        }
        let path = format!(
            "/webhooks/{}/{interaction_token}/messages/@original",
            snowflake(application_id)?
        );
        self.request(Method::PATCH, &path, Some(body), Auth::None).await.map(|_| ())
    }

    /// Creates the slash commands that don't exist yet.
    pub async fn register_commands(&self) -> Result<(), DiscordError> {
        let app = self.request(Method::GET, "/applications/@me", None, Auth::Bot).await?;
        let app_id = app["id"].as_str().ok_or_else(|| DiscordError::msg("no application id"))?;
        let path = format!("/applications/{app_id}/commands");

        let existing = self.request(Method::GET, &path, None, Auth::Bot).await?;
        let names: Vec<&str> = existing
            .as_array()
            .map(|a| a.iter().filter_map(|c| c["name"].as_str()).collect())
            .unwrap_or_default();

        let commands = [
            ("leaderboard", "Show today's Locodle leaderboard for this server"),
            ("join", "Register this channel for daily Locodle summaries"),
            ("leave", "Unregister this channel from daily Locodle summaries"),
        ];
        for (name, description) in commands {
            if !names.contains(&name) {
                let body = json!({ "name": name, "description": description });
                self.request(Method::POST, &path, Some(&body), Auth::Bot).await?;
                tracing::info!("slash command /{name} registered");
            }
        }
        tracing::info!("slash commands ready");
        Ok(())
    }
}

fn log_channel_error(channel_id: &str, err: &DiscordError) {
    match err.code {
        Some(50001) => tracing::error!(
            "Missing Access for channel {channel_id}. The bot might not be in the server or lacks permissions."
        ),
        Some(50013) => tracing::error!(
            "Missing Permissions for channel {channel_id}. The bot lacks Send Messages permission."
        ),
        _ => {}
    }
}

fn medal(index: usize) -> String {
    match index {
        0 => "🥇".into(),
        1 => "🥈".into(),
        2 => "🥉".into(),
        n => format!("#{}", n + 1),
    }
}

fn plural(n: i32, word: &str, suffix: &str) -> String {
    if n == 1 { word.to_string() } else { format!("{word}{suffix}") }
}

// ---------------------------------------------------------------------------
// Server streaks

pub async fn server_streak(app: &AppState, guild_id: &str) -> (i32, Option<NaiveDate>) {
    let row = sqlx::query(
        "SELECT current_streak, last_completion_date FROM server_streaks WHERE guild_id = $1",
    )
    .bind(guild_id)
    .fetch_optional(&app.db)
    .await;

    match row {
        Ok(Some(r)) => (
            r.try_get::<Option<i32>, _>("current_streak").ok().flatten().unwrap_or(0),
            r.try_get("last_completion_date").ok().flatten(),
        ),
        Ok(None) => (0, None),
        Err(e) => {
            tracing::error!("Failed to get server streak: {e}");
            (0, None)
        }
    }
}

async fn update_server_streak(app: &AppState, guild_id: &str, date: &str) -> i32 {
    let (current, last) = server_streak(app, guild_id).await;
    let Ok(completion) = NaiveDate::parse_from_str(date.get(..10).unwrap_or(date), "%Y-%m-%d")
    else {
        tracing::error!("Failed to update server streak: bad date {date}");
        return 0;
    };

    if last == Some(completion) {
        return current;
    }
    let new_streak = match last.map(|l| (completion - l).num_days()) {
        Some(1) => current + 1,
        Some(d) if d <= 0 => current,
        _ => 1,
    };

    let result = sqlx::query(
        "INSERT INTO server_streaks (guild_id, current_streak, last_completion_date, updated_at) \
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP) \
         ON CONFLICT (guild_id) \
         DO UPDATE SET current_streak = $2, last_completion_date = $3, updated_at = CURRENT_TIMESTAMP",
    )
    .bind(guild_id)
    .bind(new_streak)
    .bind(completion)
    .execute(&app.db)
    .await;

    match result {
        Ok(_) => {
            tracing::info!("server streak for guild {guild_id}: {new_streak} days");
            new_streak
        }
        Err(e) => {
            tracing::error!("Failed to update server streak: {e}");
            0
        }
    }
}

// ---------------------------------------------------------------------------
// Messages posted by the API

pub async fn registered_channels_for_guild(app: &AppState, guild_id: &str) -> Vec<String> {
    sqlx::query_scalar(
        "SELECT channel_id FROM discord_channels WHERE guild_id = $1 AND is_active = true",
    )
    .bind(guild_id)
    .fetch_all(&app.db)
    .await
    .unwrap_or_else(|e| {
        tracing::error!("Failed to get registered channels: {e}");
        Vec::new()
    })
}

/// Posts (or re-posts at the bottom of the channel) the running list of
/// today's completions for a guild.
pub async fn post_or_update_completion_message(
    app: &AppState,
    channel_id: &str,
    guild_id: &str,
    date: &str,
) {
    if !app.discord.enabled() {
        tracing::info!("Cannot post completion message: bot not configured");
        return;
    }
    if let Err(e) = completion_message(app, channel_id, guild_id, date).await {
        tracing::error!("Failed to post completion message to channel {channel_id}: {e}");
    }
}

async fn completion_message(
    app: &AppState,
    channel_id: &str,
    guild_id: &str,
    date: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let streak = update_server_streak(app, guild_id, date).await;

    let rows = sqlx::query(
        "SELECT u.id AS user_id, u.username, r.guesses_count, r.won, r.game_mode, r.easy_guesses_count \
         FROM daily_results r JOIN discord_users u ON r.user_id = u.id \
         WHERE r.date = $1::date AND r.guild_id = $2 ORDER BY r.guesses_count ASC",
    )
    .bind(date)
    .bind(guild_id)
    .fetch_all(&app.db)
    .await?;
    if rows.is_empty() {
        return Ok(());
    }

    let mut content = format!("🌍 **Today's Locodle Results** ({date})\n");
    if streak > 0 {
        content += &format!("🔥 **Server Streak: {streak} days** 🔥\n");
    }
    content += "\n";
    for (i, row) in rows.iter().enumerate() {
        let username: String = row.try_get("username")?;
        let won: Option<bool> = row.try_get("won")?;
        let guesses: i32 = row.try_get("guesses_count")?;
        let easy: i32 = row.try_get::<Option<i32>, _>("easy_guesses_count")?.unwrap_or(0);
        let medal = match i {
            0 => "🥇 ",
            1 => "🥈 ",
            2 => "🥉 ",
            _ => "",
        };
        let mode = if easy > 0 {
            format!(" ({easy} Easy {})", plural(easy, "guess", "es"))
        } else {
            String::new()
        };
        let emoji = if won == Some(true) { "✅" } else { "❌" };
        content += &format!(
            "{medal}**{username}** {emoji} {guesses} {} {mode}\n",
            plural(guesses, "guess", "es")
        );
    }

    let existing: Option<String> = sqlx::query_scalar(
        "SELECT message_id FROM discord_completion_messages WHERE channel_id = $1 AND date = $2::date",
    )
    .bind(channel_id)
    .bind(date)
    .fetch_optional(&app.db)
    .await?;

    // Delete the old message and send a new one so it's at the bottom
    if let Some(old_id) = &existing
        && let Err(e) = app.discord.delete_message(channel_id, old_id).await
    {
        tracing::info!("Could not delete old message (may already be deleted): {e}");
    }

    let new_id = app.discord.send_message(channel_id, &content, None).await.inspect_err(|e| {
        log_channel_error(channel_id, e);
    })?;

    if existing.is_some() {
        sqlx::query(
            "UPDATE discord_completion_messages SET message_id = $1, updated_at = CURRENT_TIMESTAMP \
             WHERE channel_id = $2 AND date = $3::date",
        )
        .bind(&new_id)
        .bind(channel_id)
        .bind(date)
        .execute(&app.db)
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO discord_completion_messages (channel_id, guild_id, date, message_id) \
             VALUES ($1, $2, $3::date, $4) \
             ON CONFLICT (channel_id, date) DO UPDATE SET message_id = $4, updated_at = CURRENT_TIMESTAMP",
        )
        .bind(channel_id)
        .bind(guild_id)
        .bind(date)
        .bind(&new_id)
        .execute(&app.db)
        .await?;
    }

    tracing::info!("Completion message posted/updated for channel {channel_id}");
    Ok(())
}

/// Posts a client-composed result message (the activity's "share" button).
pub async fn post_result_message(app: &AppState, channel_id: &str, content: &str, user_id: &str) -> bool {
    if !app.discord.enabled() {
        tracing::error!("Cannot post message: bot not configured");
        return false;
    }
    // The content comes from the client, so don't let it ping @everyone,
    // @here or roles. User mentions still work.
    let allowed = json!({ "parse": ["users"] });
    match app.discord.send_message(channel_id, content, Some(allowed)).await {
        Ok(_) => {
            tracing::info!("Result message from user {user_id} posted to channel {channel_id}");
            true
        }
        Err(e) => {
            tracing::error!("Failed to post message to channel {channel_id}: {e}");
            log_channel_error(channel_id, &e);
            false
        }
    }
}

// ---------------------------------------------------------------------------
// Scheduled daily summary

pub async fn post_daily_summary_to_all_channels(app: AppState) {
    if !app.discord.enabled() {
        tracing::info!("Cannot post daily summaries: bot not configured");
        return;
    }
    if let Err(e) = daily_summaries(&app).await {
        tracing::error!("Failed to post daily summaries: {e}");
    }
}

async fn daily_summaries(app: &AppState) -> Result<(), sqlx::Error> {
    let channels = sqlx::query(
        "SELECT channel_id, guild_id, guild_name FROM discord_channels WHERE is_active = true",
    )
    .fetch_all(&app.db)
    .await?;
    if channels.is_empty() {
        tracing::info!("No registered channels for daily summaries");
        return Ok(());
    }

    // Yesterday in Eastern time, so today's answer isn't spoiled
    let yesterday = eastern_date_of(Utc::now() - chrono::Duration::hours(24));
    tracing::info!("Generating daily summary for {yesterday} (ET)...");

    let location_name = match app.locations.daily(&app.db, Some(&yesterday)).await {
        Ok(Some(l)) => format!("{}, {}", l.name, l.country),
        _ => "Unknown Location".into(),
    };

    for ch in &channels {
        let channel_id: String = ch.try_get("channel_id")?;
        let guild_id: String = ch.try_get("guild_id")?;
        let guild_name: Option<String> = ch.try_get("guild_name")?;
        let guild_label = guild_name.as_deref().unwrap_or("?");

        let results = sqlx::query(
            "SELECT u.id AS user_id, u.username, r.score, r.guesses_count, r.won \
             FROM daily_results r JOIN discord_users u ON r.user_id = u.id \
             WHERE r.date = $1::date AND r.guild_id = $2 \
             ORDER BY r.won DESC, r.guesses_count ASC, r.score ASC",
        )
        .bind(&yesterday)
        .bind(&guild_id)
        .fetch_all(&app.db)
        .await;
        let results = match results {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to load results for {guild_label} ({channel_id}): {e}");
                continue;
            }
        };

        // Skip servers where no one played, to avoid spamming inactive ones
        if results.is_empty() {
            tracing::info!(
                "Skipping daily summary for {guild_label} ({channel_id}): no plays on {yesterday}"
            );
            continue;
        }

        let (streak, _) = server_streak(app, &guild_id).await;
        let mut msg = format!("📊 **Yesterday's Results ({yesterday})**\n");
        msg += &format!("📍 Location: **{location_name}**\n");
        if streak > 0 {
            let fire = if streak >= 5 { "🔥" } else { "✨" };
            msg += &format!("🔥 **Server Streak: {streak} days** {fire}\n");
        }
        msg += "\n";

        let winners = results
            .iter()
            .filter(|r| r.try_get::<Option<bool>, _>("won").ok().flatten() == Some(true))
            .count();
        let total_guesses: i64 = results
            .iter()
            .map(|r| r.try_get::<i32, _>("guesses_count").unwrap_or(0) as i64)
            .sum();
        let avg = total_guesses as f64 / results.len() as f64;
        msg += &format!("🏆 **Winners:** {winners}/{}\n", results.len());
        msg += &format!("📈 **Avg Guesses:** {avg:.1}\n\n");
        msg += "**Leaderboard:**\n";
        for (i, r) in results.iter().enumerate() {
            msg += &leaderboard_line(i, r);
        }
        msg += "\n🎮 Ready for today's challenge?";

        match app.discord.send_message(&channel_id, &msg, None).await {
            Ok(_) => tracing::info!("Daily summary posted to {guild_label} ({channel_id})"),
            Err(e) => {
                tracing::error!(
                    "Failed to post daily summary to channel {channel_id} ({guild_label}): {e}"
                );
                log_channel_error(&channel_id, &e);
            }
        }
    }
    Ok(())
}

fn leaderboard_line(index: usize, row: &sqlx::postgres::PgRow) -> String {
    let user_id: String = row.try_get("user_id").unwrap_or_default();
    let won = row.try_get::<Option<bool>, _>("won").ok().flatten() == Some(true);
    let guesses: i32 = row.try_get("guesses_count").unwrap_or(0);
    let score: i32 = row.try_get("score").unwrap_or(0);
    let status = if won { "✅" } else { "❌" };
    format!("{} <@{user_id}> {status} - {guesses} guesses ({score}km)\n", medal(index))
}

// ---------------------------------------------------------------------------
// Slash commands (run after the interaction has been deferred)

pub async fn run_command(app: AppState, interaction: Value) {
    let name = interaction["data"]["name"].as_str().unwrap_or_default().to_string();
    let app_id = interaction["application_id"].as_str().unwrap_or_default().to_string();
    let token = interaction["token"].as_str().unwrap_or_default().to_string();

    let body = match name.as_str() {
        "join" => cmd_join(&app, &interaction).await,
        "leave" => cmd_leave(&app, &interaction).await,
        "leaderboard" => cmd_leaderboard(&app, &interaction).await,
        _ => json!({ "content": "Unknown command" }),
    };

    if let Err(e) = app.discord.edit_original(&app_id, &token, &body).await {
        tracing::error!("Failed to respond to /{name}: {e}");
    }
}

fn channel_id_of(interaction: &Value) -> Option<String> {
    interaction["channel_id"]
        .as_str()
        .or_else(|| interaction["channel"]["id"].as_str())
        .map(str::to_owned)
}

async fn cmd_join(app: &AppState, interaction: &Value) -> Value {
    let guild_id = interaction["guild_id"].as_str();
    let channel_id = channel_id_of(interaction);

    let mut guild_name = None;
    if let Some(gid) = guild_id {
        match app.discord.guild_name(gid).await {
            Ok(n) => guild_name = n,
            Err(e) => tracing::error!("Failed to fetch guild: {e}"),
        }
    }
    let guild_name = guild_name.unwrap_or_else(|| "Unknown Server".into());
    let channel_name = interaction["channel"]["name"].as_str().unwrap_or("Unknown Channel");

    let result = sqlx::query(
        "INSERT INTO discord_channels (channel_id, guild_id, guild_name, channel_name, is_active) \
         VALUES ($1, $2, $3, $4, true) \
         ON CONFLICT (channel_id) DO UPDATE SET is_active = true, guild_name = $3, channel_name = $4",
    )
    .bind(&channel_id)
    .bind(guild_id)
    .bind(&guild_name)
    .bind(channel_name)
    .execute(&app.db)
    .await;

    if let Err(e) = result {
        tracing::error!("Join error: {e}");
        return json!({ "content": "❌ Failed to register channel." });
    }

    let minute = format!("{:0>2}", app.config.summary_minute);
    json!({
        "content": format!(
            "✅ **Locodle joined!**\n\n\
             This channel will receive daily summaries at {}:{minute} AM Eastern (showing yesterday's results).\n\
             Only players from **{guild_name}** will appear on your leaderboard.\n\n\
             Use `/leaderboard` to see today's scores!",
            app.config.summary_hour
        ),
        "components": play_button_row(),
    })
}

async fn cmd_leave(app: &AppState, interaction: &Value) -> Value {
    let result = sqlx::query("UPDATE discord_channels SET is_active = false WHERE channel_id = $1")
        .bind(channel_id_of(interaction))
        .execute(&app.db)
        .await;
    match result {
        Ok(_) => json!({
            "content": "👋 **Locodle left!**\n\nThis channel will no longer receive daily summaries."
        }),
        Err(e) => {
            tracing::error!("Leave error: {e}");
            json!({ "content": "❌ Failed to unregister channel." })
        }
    }
}

async fn cmd_leaderboard(app: &AppState, interaction: &Value) -> Value {
    let today = eastern_date_string();
    let rows = sqlx::query(
        "SELECT u.id AS user_id, u.username, r.score, r.guesses_count, r.won \
         FROM daily_results r JOIN discord_users u ON r.user_id = u.id \
         WHERE r.date = $1::date AND r.guild_id = $2 \
         ORDER BY r.won DESC, r.guesses_count ASC, r.score ASC LIMIT 10",
    )
    .bind(&today)
    .bind(interaction["guild_id"].as_str())
    .fetch_all(&app.db)
    .await;

    let rows = match rows {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Leaderboard error: {e}");
            return json!({ "content": "❌ Failed to fetch leaderboard." });
        }
    };
    if rows.is_empty() {
        return json!({
            "content": "🏆 **Today's Leaderboard**\nNo results yet from this server! Be the first to play."
        });
    }

    let mut msg = format!("🏆 **Leaderboard for {today}**\n\n");
    for (i, r) in rows.iter().enumerate() {
        msg += &leaderboard_line(i, r);
    }
    json!({ "content": msg, "components": play_button_row() })
}
