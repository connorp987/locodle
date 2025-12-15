-- Add game_date column to locations table for proper date tracking
ALTER TABLE locations ADD COLUMN IF NOT EXISTS game_date DATE;

-- Backfill existing locations with their created_at date (excluding seed locations)
UPDATE locations SET game_date = DATE(created_at) WHERE game_date IS NULL AND id > 15;

-- Clear game_date for seed locations (id <= 15) so they don't appear as daily challenges
UPDATE locations SET game_date = NULL WHERE id <= 15;

-- Create index for faster date lookups
CREATE INDEX IF NOT EXISTS idx_locations_game_date ON locations(game_date);
