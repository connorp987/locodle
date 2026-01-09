-- Create server_streaks table to track daily completion streaks per guild
CREATE TABLE IF NOT EXISTS server_streaks (
    guild_id VARCHAR(255) PRIMARY KEY,
    current_streak INTEGER DEFAULT 0,
    last_completion_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_server_streaks_guild ON server_streaks(guild_id);
