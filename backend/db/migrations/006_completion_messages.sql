-- Store Discord message IDs for completion messages (one per channel per day)
-- This allows us to edit the same message as more users complete
CREATE TABLE IF NOT EXISTS discord_completion_messages (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(255) NOT NULL,
  guild_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, date)
);

CREATE INDEX IF NOT EXISTS idx_completion_messages_channel_date ON discord_completion_messages(channel_id, date);
