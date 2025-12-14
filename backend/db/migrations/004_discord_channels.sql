-- Store registered Discord channels for daily summaries
CREATE TABLE IF NOT EXISTS discord_channels (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(255) UNIQUE NOT NULL,
  guild_id VARCHAR(255) NOT NULL,
  guild_name VARCHAR(255),
  channel_name VARCHAR(255),
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_discord_channels_channel_id ON discord_channels(channel_id);
CREATE INDEX IF NOT EXISTS idx_discord_channels_guild_id ON discord_channels(guild_id);

-- Add guild_id to discord_users to track which server they're associated with
ALTER TABLE discord_users ADD COLUMN IF NOT EXISTS guild_id VARCHAR(255);

-- Add guild_id to daily_results to filter by server
ALTER TABLE daily_results ADD COLUMN IF NOT EXISTS guild_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_daily_results_guild_id ON daily_results(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_users_guild_id ON discord_users(guild_id);
