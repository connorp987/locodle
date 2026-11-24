use std::{env, path::PathBuf};

use ed25519_dalek::VerifyingKey;

/// Runtime configuration, read once from the environment at startup.
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub static_dir: Option<PathBuf>,
    pub frontend_url: Option<String>,
    pub run_migrations: bool,

    pub discord_client_id: Option<String>,
    pub discord_client_secret: Option<String>,
    pub discord_bot_token: Option<String>,
    /// Application public key, used to verify HTTP interaction requests.
    pub discord_public_key: Option<VerifyingKey>,
    pub summary_hour: String,
    pub summary_minute: String,

    pub ga_measurement_id: String,
    pub ga_api_secret: Option<String>,
}

/// An env var, treating empty values as unset.
pub fn var(name: &str) -> Option<String> {
    env::var(name).ok().filter(|v| !v.trim().is_empty())
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let discord_public_key = match var("DISCORD_PUBLIC_KEY") {
            None => None,
            Some(hex_key) => {
                let bytes: [u8; 32] = hex::decode(hex_key.trim())
                    .ok()
                    .and_then(|b| b.try_into().ok())
                    .ok_or("DISCORD_PUBLIC_KEY must be 64 hex characters")?;
                Some(
                    VerifyingKey::from_bytes(&bytes)
                        .map_err(|e| format!("DISCORD_PUBLIC_KEY is invalid: {e}"))?,
                )
            }
        };

        // An explicit STATIC_DIR must exist; the default is optional so the
        // API can run on its own during development.
        let static_dir = match var("STATIC_DIR") {
            Some(dir) => {
                let path = PathBuf::from(dir);
                if !path.join("index.html").is_file() {
                    return Err(format!(
                        "STATIC_DIR {} has no index.html",
                        path.display()
                    ));
                }
                Some(path)
            }
            None => Some(PathBuf::from("public")).filter(|p| p.join("index.html").is_file()),
        };

        Ok(Self {
            port: var("PORT").and_then(|p| p.parse().ok()).unwrap_or(3001),
            database_url: var("DATABASE_URL").unwrap_or_else(|| {
                "postgresql://locodle:locodle_dev_password@localhost:5432/locodle".into()
            }),
            static_dir,
            frontend_url: var("FRONTEND_URL"),
            run_migrations: matches!(
                var("RUN_MIGRATIONS").as_deref(),
                Some("1" | "true" | "yes")
            ),
            discord_client_id: var("DISCORD_CLIENT_ID"),
            discord_client_secret: var("DISCORD_CLIENT_SECRET"),
            discord_bot_token: var("DISCORD_BOT_TOKEN"),
            discord_public_key,
            summary_hour: var("DISCORD_SUMMARY_HOUR").unwrap_or_else(|| "9".into()),
            summary_minute: var("DISCORD_SUMMARY_MINUTE").unwrap_or_else(|| "30".into()),
            ga_measurement_id: var("GA_MEASUREMENT_ID").unwrap_or_else(|| "G-8V7LKZ4W98".into()),
            ga_api_secret: var("GA_API_SECRET"),
        })
    }
}
