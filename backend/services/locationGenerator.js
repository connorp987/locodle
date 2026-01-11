import pool from "../db/connection.js";
import { LOCATION_TEMPLATES } from "../utils/locationTemplates.js";
import { generateHints, getEasternDateString } from "../utils/locationUtils.js";

// Challenging locations - mix of lesser-known landmarks, obscure places, and tricky spots
// Difficulty: hard (most people won't know exact location)

// Get location for a specific date (defaults to today in Eastern Time)
export async function getLocationForDate(date = null) {
  const targetDate = date || getEasternDateString();

  try {
    // Check if we already have a location for this date
    // Use is_daily_challenge flag instead of fragile ID checks
    let result = await pool.query(
      "SELECT * FROM locations WHERE game_date = $1 AND is_active = true AND is_daily_challenge = true LIMIT 1",
      [targetDate]
    );

    console.log(
      `🔍 Looking for location on ${targetDate}, found: ${
        result.rows.length > 0 ? result.rows[0].name : "none"
      }`
    );

    if (result.rows.length > 0) {
      const location = result.rows[0];
      return {
        id: location.id,
        name: location.name,
        lat: parseFloat(location.lat),
        lng: parseFloat(location.lng),
        country: location.country,
        hints: location.hints,
      };
    }

    // If requesting today and no location exists, generate one
    const today = getEasternDateString();
    console.log(
      `🔍 Comparing targetDate: "${targetDate}" with today: "${today}"`
    );
    if (targetDate === today) {
      console.log(`✅ Generating new location for today: ${today}`);
      return await generateNewLocation();
    }

    // If requesting a past date that doesn't exist, return null or throw
    console.log(`⚠️  No location found for past date: ${targetDate}`);
    return null;
  } catch (error) {
    console.error(
      `❌ Error getting location for date ${targetDate}:`,
      error.message
    );
    throw error;
  }
}

// Get all available dates that have games
export async function getAvailableDates() {
  try {
    // Use is_daily_challenge flag for precision
    const result = await pool.query(
      "SELECT DISTINCT TO_CHAR(game_date, 'YYYY-MM-DD') as date FROM locations WHERE is_active = true AND is_daily_challenge = true ORDER BY date DESC"
    );
    return result.rows.map((row) => row.date);
  } catch (error) {
    console.error("Error getting available dates:", error);
    throw error;
  }
}

// Generate a new random location
async function generateNewLocation() {
  try {
    // Get ALL location names from the database to avoid duplicates in the last 30 days
    const existingResult = await pool.query(
      `SELECT DISTINCT name FROM locations 
       WHERE created_at > NOW() - INTERVAL '30 days'`
    );

    const recentNames = new Set(existingResult.rows.map((row) => row.name));
    console.log(
      `🔍 Recent/excluded names from DB: ${existingResult.rows.length}`
    );

    // Also exclude the easy seed location names explicitly
    const easyLocations = new Set([
      "Eiffel Tower",
      "Statue of Liberty",
      "Great Wall of China",
      "Taj Mahal",
      "Machu Picchu",
      "Colosseum",
      "Sydney Opera House",
      "Christ the Redeemer",
      "Big Ben",
      "Burj Khalifa",
      "Golden Gate Bridge",
      "Pyramids of Giza",
      "Stonehenge",
      "Mount Fuji",
      "Sagrada Familia",
    ]);

    // Filter out recently used locations AND easy seed locations
    const availableLocations = LOCATION_TEMPLATES.filter(
      (loc) => !recentNames.has(loc.name) && !easyLocations.has(loc.name)
    );

    console.log(
      `🎯 Available locations after filtering: ${availableLocations.length} (from ${LOCATION_TEMPLATES.length} total)`
    );

    // If all locations have been used recently, reset but still exclude easy ones
    let locationPool = availableLocations;
    if (locationPool.length === 0) {
      console.log(
        "⚠️ All locations used recently, resetting pool (excluding easy ones)"
      );
      locationPool = LOCATION_TEMPLATES.filter(
        (loc) => !easyLocations.has(loc.name)
      );
    }

    // If still empty (shouldn't happen with 140+ locations), use all
    if (locationPool.length === 0) {
      console.log("⚠️ Still empty, using all locations");
      locationPool = LOCATION_TEMPLATES;
    }

    // Pick a random location
    const randomLocation =
      locationPool[Math.floor(Math.random() * locationPool.length)];

    console.log(
      `🎲 Selected: ${randomLocation.name}, ${randomLocation.country}`
    );

    // Generate hints
    const hints = generateHints(randomLocation);

    // Insert into database with game_date set to today in Eastern Time
    // Use ON CONFLICT to handle race conditions where another instance generated today's location first
    const todayEastern = getEasternDateString();
    const result = await pool.query(
      `INSERT INTO locations (name, lat, lng, country, hints, game_date, is_daily_challenge) 
       VALUES ($1, $2, $3, $4, $5, $6, true) 
       ON CONFLICT (game_date) WHERE is_daily_challenge = true 
       DO UPDATE SET game_date = EXCLUDED.game_date -- No-op to trigger returning existing row
       RETURNING *`,
      [
        randomLocation.name,
        randomLocation.lat,
        randomLocation.lng,
        randomLocation.country,
        JSON.stringify(hints),
        todayEastern,
      ]
    );

    const location = result.rows[0];
    console.log(
      `🎯 Successfully settled on location for ${todayEastern}: ${location.name}, ${location.country}`
    );

    return {
      id: location.id,
      name: location.name,
      lat: parseFloat(location.lat),
      lng: parseFloat(location.lng),
      country: location.country,
      hints: location.hints,
    };
  } catch (error) {
    console.error("Error generating new location:", error);
    throw error;
  }
}

// Session management functions removed as we migrated to local storage
