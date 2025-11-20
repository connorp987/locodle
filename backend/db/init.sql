-- Create locations table
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    country VARCHAR(100) NOT NULL,
    hints JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Create index for faster queries
CREATE INDEX idx_locations_active ON locations(is_active);

-- Insert initial locations
INSERT INTO locations (name, lat, lng, country, hints) VALUES
('Eiffel Tower', 48.8584, 2.2945, 'France', 
 '["This iconic iron lattice tower is one of the most recognizable landmarks in the world", "Located in a major European capital city", "Built for the 1889 World''s Fair"]'),

('Statue of Liberty', 40.6892, -74.0445, 'United States',
 '["A gift from France to the United States", "Located on an island in a major harbor", "Symbol of freedom and democracy"]'),

('Great Wall of China', 40.4319, 116.5704, 'China',
 '["Ancient fortification stretching thousands of miles", "Built over many centuries to protect against invasions", "One of the Seven Wonders of the Medieval World"]'),

('Taj Mahal', 27.1751, 78.0421, 'India',
 '["White marble mausoleum built by a Mughal emperor", "Symbol of eternal love", "Located in Agra"]'),

('Machu Picchu', -13.1631, -72.5450, 'Peru',
 '["Ancient Incan citadel in the Andes Mountains", "Rediscovered in 1911", "Located at high altitude in South America"]'),

('Colosseum', 41.8902, 12.4922, 'Italy',
 '["Ancient Roman amphitheater", "Hosted gladiatorial contests", "Located in the heart of a historic European capital"]'),

('Sydney Opera House', -33.8568, 151.2153, 'Australia',
 '["Distinctive sail-shaped roof design", "Major performing arts center", "Located on a harbor in the Southern Hemisphere"]'),

('Christ the Redeemer', -22.9519, -43.2105, 'Brazil',
 '["Art Deco statue of Jesus Christ", "Overlooks a major South American city", "Arms stretched wide atop a mountain"]'),

('Big Ben', 51.5007, -0.1246, 'United Kingdom',
 '["Famous clock tower in a European capital", "Part of the Palace of Westminster", "Gothic Revival architecture"]'),

('Burj Khalifa', 25.1972, 55.2744, 'United Arab Emirates',
 '["World''s tallest building", "Located in a desert city known for luxury", "Modern architectural marvel in the Middle East"]'),

('Golden Gate Bridge', 37.8199, -122.4783, 'United States',
 '["Iconic suspension bridge painted in International Orange", "Connects San Francisco to Marin County", "Completed in 1937"]'),

('Pyramids of Giza', 29.9792, 31.1342, 'Egypt',
 '["Ancient structures built as tombs for pharaohs", "One of the Seven Wonders of the Ancient World", "Located near Cairo"]'),

('Stonehenge', 51.1789, -1.8262, 'United Kingdom',
 '["Prehistoric monument consisting of massive standing stones", "Located on Salisbury Plain", "Built around 3000 BC"]'),

('Mount Fuji', 35.3606, 138.7274, 'Japan',
 '["Iconic snow-capped volcanic mountain", "Highest peak in Japan", "Sacred mountain and popular climbing destination"]'),

('Sagrada Familia', 41.4036, 2.1744, 'Spain',
 '["Unfinished basilica designed by Antoni Gaudí", "Construction began in 1882", "Located in Barcelona"]');

-- Create game_sessions table for tracking user games
CREATE TABLE IF NOT EXISTS game_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    location_id INTEGER REFERENCES locations(id),
    guesses JSONB DEFAULT '[]',
    completed BOOLEAN DEFAULT false,
    won BOOLEAN DEFAULT false,
    game_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster session lookups
CREATE INDEX idx_game_sessions_session_id ON game_sessions(session_id);
CREATE INDEX idx_game_sessions_date ON game_sessions(game_date);
