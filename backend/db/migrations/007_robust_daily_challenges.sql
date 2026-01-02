-- Migration 007: Robust Daily Challenges
-- 1. Add is_daily_challenge flag to distinguish between pool templates and active challenges
ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_daily_challenge BOOLEAN DEFAULT false;

-- 2. Drop existing problematic indexes/constraints to ensure cleanup can happen
DROP INDEX IF EXISTS unique_active_game_date;
DROP INDEX IF EXISTS unique_game_date;
ALTER TABLE locations DROP CONSTRAINT IF EXISTS unique_game_date;

-- 3. Clean up duplicates: if multiple locations exist for the same game_date, 
-- keep only the earliest one (the one that was first generated) and set others to inactive/remove date
WITH duplicates AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY game_date ORDER BY created_at ASC) as rank
    FROM locations 
    WHERE game_date IS NOT NULL
)
UPDATE locations 
SET game_date = NULL, is_daily_challenge = false, is_active = false
WHERE id IN (SELECT id FROM duplicates WHERE rank > 1);

-- 4. Mark remaining daily challenges
UPDATE locations SET is_daily_challenge = true WHERE game_date IS NOT NULL;

-- 5. Add unique constraints
-- Prevent multiple active challenges for the same date
-- We use a partial unique index to only enforce uniqueness for is_daily_challenge = true
-- This allows templates to have game_date = NULL without conflict
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_game_date ON locations (game_date) WHERE is_daily_challenge = true;

-- Prevent duplicate templates (same name and country)
-- 1. Clean up duplicate templates first
WITH template_dupes AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY name, country ORDER BY id ASC) as rank
    FROM locations
)
DELETE FROM locations WHERE id IN (SELECT id FROM template_dupes WHERE rank > 1);

-- 2. Add the constraint idempotently
ALTER TABLE locations DROP CONSTRAINT IF EXISTS unique_name_country;
ALTER TABLE locations ADD CONSTRAINT unique_name_country UNIQUE (name, country);

-- 6. Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_locations_daily_challenge ON locations(is_daily_challenge) WHERE is_daily_challenge = true;
