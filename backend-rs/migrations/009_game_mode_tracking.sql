-- Add game_mode column to daily_results table to track easy/hard mode
ALTER TABLE daily_results ADD COLUMN IF NOT EXISTS game_mode VARCHAR(10) DEFAULT 'hard';

-- Add check constraint to ensure only valid game modes
ALTER TABLE daily_results DROP CONSTRAINT IF EXISTS check_game_mode;
ALTER TABLE daily_results ADD CONSTRAINT check_game_mode CHECK (game_mode IN ('easy', 'hard'));
