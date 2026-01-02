-- Add game_date column to locations table for proper date tracking
ALTER TABLE locations ADD COLUMN IF NOT EXISTS game_date DATE;

-- Drop overly restrictive unique index/constraint if it exists from a previous failed state
-- We will replace this with a better partial unique index in migration 007
ALTER TABLE locations DROP CONSTRAINT IF EXISTS unique_game_date;
DROP INDEX IF EXISTS unique_game_date;

-- Backfill existing locations with their created_at date (excluding seed locations)
-- If we encounter duplicates during backfill, we keep the earliest one
WITH backfill AS (
    SELECT id, created_at, 
           ROW_NUMBER() OVER (PARTITION BY DATE(created_at) ORDER BY created_at ASC) as rank
    FROM locations 
    WHERE game_date IS NULL AND id > 15
)
UPDATE locations l
SET game_date = DATE(b.created_at)
FROM backfill b
WHERE l.id = b.id AND b.rank = 1;

-- Clear game_date for seed locations (id <= 15) so they don't appear as daily challenges
UPDATE locations SET game_date = NULL WHERE id <= 15;

-- Create a non-unique index for performance (uniqueness handled in 007)
CREATE INDEX IF NOT EXISTS idx_locations_game_date ON locations(game_date);
