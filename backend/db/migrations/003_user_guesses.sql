-- Store individual guesses for user history and statistics
CREATE TABLE IF NOT EXISTS user_guesses (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) REFERENCES discord_users(id),
  date DATE NOT NULL,
  guess_number INTEGER NOT NULL,
  lat DECIMAL(10, 8) NOT NULL,
  lng DECIMAL(11, 8) NOT NULL,
  location_name VARCHAR(500),
  distance INTEGER NOT NULL, -- Distance in km
  score DECIMAL(5, 1) NOT NULL,
  direction VARCHAR(2),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_guesses_user_id ON user_guesses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_guesses_date ON user_guesses(user_id, date);
