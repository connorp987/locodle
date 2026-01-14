-- Add game_mode column to user_guesses to track mode per guess
ALTER TABLE user_guesses ADD COLUMN IF NOT EXISTS game_mode VARCHAR(10) DEFAULT 'hard';

-- Add check constraint to ensure only valid game modes
ALTER TABLE user_guesses DROP CONSTRAINT IF EXISTS check_guess_game_mode;
ALTER TABLE user_guesses ADD CONSTRAINT check_guess_game_mode CHECK (game_mode IN ('easy', 'hard'));

-- Add easy_guesses_count column to track how many guesses were made in easy mode
ALTER TABLE daily_results ADD COLUMN IF NOT EXISTS easy_guesses_count INTEGER DEFAULT 0;

-- Update existing records to set easy_guesses_count based on game_mode
-- If game_mode is 'easy', assume all guesses were in easy mode
UPDATE daily_results 
SET easy_guesses_count = guesses_count 
WHERE game_mode = 'easy' AND easy_guesses_count = 0;
