import pool from "../db/connection.js";

// Famous landmarks, cities, and natural wonders for random generation
const LOCATION_TEMPLATES = [
  // Major Cities
  {
    type: "city",
    name: "Tokyo",
    lat: 35.6762,
    lng: 139.6503,
    country: "Japan",
  },
  {
    type: "city",
    name: "New York City",
    lat: 40.7128,
    lng: -74.006,
    country: "United States",
  },
  {
    type: "city",
    name: "London",
    lat: 51.5074,
    lng: -0.1278,
    country: "United Kingdom",
  },
  { type: "city", name: "Paris", lat: 48.8566, lng: 2.3522, country: "France" },
  {
    type: "city",
    name: "Dubai",
    lat: 25.2048,
    lng: 55.2708,
    country: "United Arab Emirates",
  },
  {
    type: "city",
    name: "Singapore",
    lat: 1.3521,
    lng: 103.8198,
    country: "Singapore",
  },
  {
    type: "city",
    name: "Hong Kong",
    lat: 22.3193,
    lng: 114.1694,
    country: "Hong Kong",
  },
  {
    type: "city",
    name: "Sydney",
    lat: -33.8688,
    lng: 151.2093,
    country: "Australia",
  },
  { type: "city", name: "Rome", lat: 41.9028, lng: 12.4964, country: "Italy" },
  {
    type: "city",
    name: "Barcelona",
    lat: 41.3851,
    lng: 2.1734,
    country: "Spain",
  },
  {
    type: "city",
    name: "Amsterdam",
    lat: 52.3676,
    lng: 4.9041,
    country: "Netherlands",
  },
  { type: "city", name: "Berlin", lat: 52.52, lng: 13.405, country: "Germany" },
  {
    type: "city",
    name: "Moscow",
    lat: 55.7558,
    lng: 37.6173,
    country: "Russia",
  },
  {
    type: "city",
    name: "Istanbul",
    lat: 41.0082,
    lng: 28.9784,
    country: "Turkey",
  },
  {
    type: "city",
    name: "Bangkok",
    lat: 13.7563,
    lng: 100.5018,
    country: "Thailand",
  },
  { type: "city", name: "Mumbai", lat: 19.076, lng: 72.8777, country: "India" },
  { type: "city", name: "Cairo", lat: 30.0444, lng: 31.2357, country: "Egypt" },
  {
    type: "city",
    name: "Mexico City",
    lat: 19.4326,
    lng: -99.1332,
    country: "Mexico",
  },
  {
    type: "city",
    name: "Rio de Janeiro",
    lat: -22.9068,
    lng: -43.1729,
    country: "Brazil",
  },
  {
    type: "city",
    name: "Buenos Aires",
    lat: -34.6037,
    lng: -58.3816,
    country: "Argentina",
  },
  {
    type: "city",
    name: "Cape Town",
    lat: -33.9249,
    lng: 18.4241,
    country: "South Africa",
  },
  {
    type: "city",
    name: "Toronto",
    lat: 43.6532,
    lng: -79.3832,
    country: "Canada",
  },
  {
    type: "city",
    name: "Los Angeles",
    lat: 34.0522,
    lng: -118.2437,
    country: "United States",
  },
  {
    type: "city",
    name: "Chicago",
    lat: 41.8781,
    lng: -87.6298,
    country: "United States",
  },
  {
    type: "city",
    name: "San Francisco",
    lat: 37.7749,
    lng: -122.4194,
    country: "United States",
  },
  {
    type: "city",
    name: "Las Vegas",
    lat: 36.1699,
    lng: -115.1398,
    country: "United States",
  },
  {
    type: "city",
    name: "Miami",
    lat: 25.7617,
    lng: -80.1918,
    country: "United States",
  },
  {
    type: "city",
    name: "Seattle",
    lat: 47.6062,
    lng: -122.3321,
    country: "United States",
  },
  {
    type: "city",
    name: "Boston",
    lat: 42.3601,
    lng: -71.0589,
    country: "United States",
  },
  {
    type: "city",
    name: "Washington DC",
    lat: 38.9072,
    lng: -77.0369,
    country: "United States",
  },

  // Natural Wonders
  {
    type: "natural",
    name: "Grand Canyon",
    lat: 36.1069,
    lng: -112.1129,
    country: "United States",
  },
  {
    type: "natural",
    name: "Niagara Falls",
    lat: 43.0896,
    lng: -79.0849,
    country: "Canada",
  },
  {
    type: "natural",
    name: "Victoria Falls",
    lat: -17.9243,
    lng: 25.8572,
    country: "Zimbabwe",
  },
  {
    type: "natural",
    name: "Great Barrier Reef",
    lat: -18.2871,
    lng: 147.6992,
    country: "Australia",
  },
  {
    type: "natural",
    name: "Mount Everest",
    lat: 27.9881,
    lng: 86.925,
    country: "Nepal",
  },
  {
    type: "natural",
    name: "Amazon Rainforest",
    lat: -3.4653,
    lng: -62.2159,
    country: "Brazil",
  },
  {
    type: "natural",
    name: "Sahara Desert",
    lat: 23.8859,
    lng: 8.6753,
    country: "Algeria",
  },
  {
    type: "natural",
    name: "Antarctica",
    lat: -82.8628,
    lng: 135.0,
    country: "Antarctica",
  },
  {
    type: "natural",
    name: "Yellowstone National Park",
    lat: 44.428,
    lng: -110.5885,
    country: "United States",
  },
  {
    type: "natural",
    name: "Yosemite National Park",
    lat: 37.8651,
    lng: -119.5383,
    country: "United States",
  },

  // Famous Landmarks
  {
    type: "landmark",
    name: "Angkor Wat",
    lat: 13.4125,
    lng: 103.867,
    country: "Cambodia",
  },
  {
    type: "landmark",
    name: "Petra",
    lat: 30.3285,
    lng: 35.4444,
    country: "Jordan",
  },
  {
    type: "landmark",
    name: "Acropolis",
    lat: 37.9715,
    lng: 23.7257,
    country: "Greece",
  },
  {
    type: "landmark",
    name: "Forbidden City",
    lat: 39.9163,
    lng: 116.3972,
    country: "China",
  },
  {
    type: "landmark",
    name: "Alhambra",
    lat: 37.176,
    lng: -3.5881,
    country: "Spain",
  },
  {
    type: "landmark",
    name: "Neuschwanstein Castle",
    lat: 47.5576,
    lng: 10.7498,
    country: "Germany",
  },
  {
    type: "landmark",
    name: "Buckingham Palace",
    lat: 51.5014,
    lng: -0.1419,
    country: "United Kingdom",
  },
  {
    type: "landmark",
    name: "Versailles",
    lat: 48.8049,
    lng: 2.1204,
    country: "France",
  },
  {
    type: "landmark",
    name: "Kremlin",
    lat: 55.752,
    lng: 37.6175,
    country: "Russia",
  },
  {
    type: "landmark",
    name: "Hagia Sophia",
    lat: 41.0086,
    lng: 28.9802,
    country: "Turkey",
  },
];

// Generate hints based on location type and properties
function generateHints(location) {
  const hints = [];

  // Hint about type
  if (location.type === "city") {
    hints.push(`This is a major city in ${location.country}`);
  } else if (location.type === "natural") {
    hints.push(`This is a natural wonder or landmark`);
  } else if (location.type === "landmark") {
    hints.push(`This is a famous historical or cultural landmark`);
  }

  // Hint about hemisphere
  if (location.lat > 0) {
    hints.push("Located in the Northern Hemisphere");
  } else {
    hints.push("Located in the Southern Hemisphere");
  }

  // Hint about continent
  const continent = getContinent(location.country);
  if (continent) {
    hints.push(`Located in ${continent}`);
  }

  return hints;
}

function getContinent(country) {
  const continents = {
    Japan: "Asia",
    "United States": "North America",
    "United Kingdom": "Europe",
    France: "Europe",
    "United Arab Emirates": "Asia",
    Singapore: "Asia",
    "Hong Kong": "Asia",
    Australia: "Oceania",
    Italy: "Europe",
    Spain: "Europe",
    Netherlands: "Europe",
    Germany: "Europe",
    Russia: "Europe/Asia",
    Turkey: "Europe/Asia",
    Thailand: "Asia",
    India: "Asia",
    Egypt: "Africa",
    Mexico: "North America",
    Brazil: "South America",
    Argentina: "South America",
    "South Africa": "Africa",
    Canada: "North America",
    Zimbabwe: "Africa",
    Nepal: "Asia",
    Algeria: "Africa",
    Antarctica: "Antarctica",
    Cambodia: "Asia",
    Jordan: "Asia",
    Greece: "Europe",
    China: "Asia",
  };

  return continents[country] || null;
}

// Get location for a specific date (defaults to today)
export async function getLocationForDate(date = null) {
  const targetDate = date || new Date().toISOString().split("T")[0];

  try {
    // Check if we already have a location for this date
    const result = await pool.query(
      "SELECT * FROM locations WHERE DATE(created_at) = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1",
      [targetDate]
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
    const today = new Date().toISOString().split("T")[0];
    if (targetDate === today) {
      return await generateNewLocation();
    }

    // If requesting a past date that doesn't exist, return null or throw
    return null;
  } catch (error) {
    console.error("Error getting location for date:", error);
    throw error;
  }
}

// Get all available dates that have games
export async function getAvailableDates() {
  try {
    const result = await pool.query(
      "SELECT DISTINCT DATE(created_at) as date FROM locations WHERE is_active = true ORDER BY date DESC"
    );
    return result.rows.map((row) => {
        // Format date as YYYY-MM-DD to avoid timezone issues
        const d = new Date(row.date);
        return d.toISOString().split('T')[0];
    });
  } catch (error) {
    console.error("Error getting available dates:", error);
    throw error;
  }
}


// Generate a new random location
async function generateNewLocation() {
  try {
    // Get all existing location names to avoid duplicates in recent history
    const existingResult = await pool.query(
      "SELECT name FROM locations WHERE created_at > NOW() - INTERVAL '30 days' ORDER BY created_at DESC"
    );

    const recentNames = new Set(existingResult.rows.map((row) => row.name));

    // Filter out recently used locations
    const availableLocations = LOCATION_TEMPLATES.filter(
      (loc) => !recentNames.has(loc.name)
    );

    // If all locations have been used recently, use all templates
    const locationPool =
      availableLocations.length > 0 ? availableLocations : LOCATION_TEMPLATES;

    // Pick a random location
    const randomLocation =
      locationPool[Math.floor(Math.random() * locationPool.length)];

    // Generate hints
    const hints = generateHints(randomLocation);

    // Insert into database
    const result = await pool.query(
      "INSERT INTO locations (name, lat, lng, country, hints) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [
        randomLocation.name,
        randomLocation.lat,
        randomLocation.lng,
        randomLocation.country,
        JSON.stringify(hints),
      ]
    );

    const location = result.rows[0];
    console.log(
      `🎯 Generated new location for today: ${location.name}, ${location.country}`
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
