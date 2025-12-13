import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import {
  getLocationForDate,
  getAvailableDates,
} from "./services/locationGenerator.js";
import pool from "./db/connection.js";
import { initDiscordBot } from "./services/discordBot.js";

// Initialize Discord Bot
initDiscordBot();

const fastify = Fastify({
  logger: true,
});

// Enable CORS for frontend
await fastify.register(cors, {
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://dependable-rebirth-production-4f9e.up.railway.app",
    "https://locodle.com",
    "https://www.locodle.com",
    /\.discordsays\.com$/,
    process.env.FRONTEND_URL,
  ].filter(Boolean),
});

// Rate limiting
await fastify.register(rateLimit, {
  max: 80,
  timeWindow: 60 * 1000, // 1 minute
});

// Cache for locations by date to avoid repeated DB queries
const locationCache = new Map();

// Get daily location (same for all players on a given day)
async function getDailyLocation(date = null) {
  const targetDate = date || new Date().toISOString().split("T")[0];

  // Check in-memory cache first
  if (locationCache.has(targetDate)) {
    return locationCache.get(targetDate);
  }

  // Get or generate location from database
  const location = await getLocationForDate(targetDate);

  // Cache the result
  if (location) {
    locationCache.set(targetDate, location);
  }

  return location;
}

// Routes
fastify.get("/api/health", async (request, reply) => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

fastify.get("/api/days", async (request, reply) => {
  try {
    const dates = await getAvailableDates();
    return { dates };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: "Failed to load available dates" });
  }
});

fastify.get("/api/daily-challenge", async (request, reply) => {
  try {
    const { date } = request.query;
    const dailyLocation = await getDailyLocation(date);

    if (!dailyLocation) {
      return reply
        .code(404)
        .send({ error: "No challenge found for this date" });
    }

    // Return location without revealing the answer
    return {
      date: date || new Date().toISOString().split("T")[0],
      hints: dailyLocation.hints,
      maxGuesses: 6,
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: "Failed to load daily challenge" });
  }
});

fastify.post("/api/guess", async (request, reply) => {
  const { guess, date, isLastGuess } = request.body;

  if (!guess) {
    return reply.code(400).send({ error: "Missing guess" });
  }

  try {
    // Parallelize DB fetch and Nominatim lookup for speed
    const [dailyLocation, nominatimResult] = await Promise.all([
      getDailyLocation(date),
      (async () => {
        // Helper to fetch with timeout
        const fetchWithTimeout = async (url, timeoutMs) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const res = await fetch(url, {
              headers: { "User-Agent": "Locodle/1.0" },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
          } catch (err) {
            clearTimeout(timeoutId);
            throw err;
          }
        };

        // 1. Try Nominatim (Primary)
        try {
          const data = await fetchWithTimeout(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${guess.lat}&lon=${guess.lng}&addressdetails=1`,
            1500 // 1.5s timeout
          );
          return {
            name: data.display_name,
            address: data.address,
          };
        } catch (err) {
          console.log("Nominatim failed/timed out, trying backup...");
        }

        // 2. Try BigDataCloud (Backup)
        try {
          const data = await fetchWithTimeout(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${guess.lat}&longitude=${guess.lng}&localityLanguage=en`,
            5000 // 5s timeout
          );
          // Format BigDataCloud response to match our needs
          const parts = [
            data.locality,
            data.city,
            data.principalSubdivision,
            data.countryName,
          ].filter(Boolean);

          return {
            name: parts.join(", "),
            address: {
              city: data.city || data.locality,
              state: data.principalSubdivision,
              country: data.countryName,
              country_code: data.countryCode?.toLowerCase(),
            },
          };
        } catch (err) {
          console.error("All geocoding providers failed:", err);
          return null;
        }
      })(),
    ]);

    if (!dailyLocation) {
      return reply
        .code(404)
        .send({ error: "No challenge found for this date" });
    }

    // Process Geocoding Result
    let guessName = guess.name;
    let guessAddress = null;
    if (nominatimResult) {
      if (nominatimResult.name) guessName = nominatimResult.name;
      if (nominatimResult.address) guessAddress = nominatimResult.address;
    }

    // Calculate distance between guess and actual location
    const distance = calculateDistance(
      guess.lat,
      guess.lng,
      dailyLocation.lat,
      dailyLocation.lng
    );

    // Calculate bearing
    const bearing = calculateBearing(
      guess.lat,
      guess.lng,
      dailyLocation.lat,
      dailyLocation.lng
    );
    const direction = getCardinalDirection(bearing);

    // Calculate score (-20 to 100)
    // Max distance is approx 20,000 km
    // 0 km = 100
    // 20,000 km = -20
    // Formula: 100 - (distance / 20000) * 120
    const score = Math.round((100 - (distance / 20000) * 120) * 10) / 10;

    const guessResult = {
      guess: guessName,
      lat: guess.lat,
      lng: guess.lng,
      distance: Math.round(distance),
      score: score,
      bearing: Math.round(bearing),
      direction: direction,
      timestamp: new Date().toISOString(),
      address: guessAddress,
    };

    // Check if won (within 50km)
    const won = distance < 50;
    const completed = won; // Game over only if won (unlimited guesses)

    // Save guess to DB if user is logged in
    if (request.body.discord_user_id) {
      const { discord_user_id, username, avatar } = request.body;
      const gameDate = date || new Date().toISOString().split("T")[0];

      try {
        // Upsert user
        await pool.query(
          `INSERT INTO discord_users (id, username, avatar) 
           VALUES ($1, $2, $3) 
           ON CONFLICT (id) DO UPDATE SET username = $2, avatar = $3`,
          [discord_user_id, username, avatar]
        );

        // Save individual guess
        await pool.query(
          `INSERT INTO user_guesses (user_id, date, guess_number, lat, lng, location_name, distance, score, direction)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            discord_user_id,
            gameDate,
            request.body.guessCount || 1,
            guess.lat,
            guess.lng,
            guessName,
            Math.round(distance),
            score,
            direction,
          ]
        );

        // If game completed, save to daily_results
        if (completed) {
          await pool.query(
            `INSERT INTO daily_results (user_id, date, score, guesses_count, won)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, date) DO NOTHING`,
            [
              discord_user_id,
              gameDate,
              Math.round(distance),
              request.body.guessCount || 1,
              won,
            ]
          );
        }
      } catch (dbError) {
        console.error("Failed to save guess:", dbError);
      }
    }

    return {
      ...guessResult,
      completed: completed,
      won: won,
      answer: completed
        ? {
            name: dailyLocation.name,
            lat: dailyLocation.lat,
            lng: dailyLocation.lng,
            country: dailyLocation.country,
            hints: dailyLocation.hints, // Return hints on completion so they can see what they missed
          }
        : null,
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: "Failed to process guess" });
  }
});

// Tile Proxy for Discord Activity (CSP Bypass)
fastify.get("/api/tiles/:z/:x/:y", async (request, reply) => {
  const { z, x, y } = request.params;
  // Using CartoDB Voyager tiles (same as frontend)
  const tileUrl = `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;

  try {
    const response = await fetch(tileUrl);
    if (!response.ok)
      throw new Error(`Tile fetch failed: ${response.statusText}`);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    reply.header("Content-Type", "image/png");
    reply.header("Cache-Control", "public, max-age=86400"); // Cache for 1 day
    return reply.send(buffer);
  } catch (error) {
    fastify.log.error(`Tile proxy error: ${error.message}`);
    return reply.code(500).send("Failed to fetch tile");
  }
});

// Discord Token Exchange
fastify.post("/api/token", async (request, reply) => {
  const { code, redirect_uri } = request.body;

  if (!code) {
    return reply.code(400).send({ error: "Missing code" });
  }

  try {
    // Build token exchange params
    const tokenParams = {
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: code,
    };

    // Add redirect_uri if provided (for web OAuth flow)
    // Strip trailing slash to ensure consistency
    if (redirect_uri) {
      tokenParams.redirect_uri = redirect_uri.replace(/\/+$/, "");
    }

    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(tokenParams),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "❌ Discord Token Exchange Failed:",
        "Status:",
        response.status,
        "Response:",
        JSON.stringify(data),
        "Sent Params:",
        JSON.stringify({
          ...tokenParams,
          client_secret: "[REDACTED]",
          code: "[REDACTED]",
        })
      );
      fastify.log.error("Discord Token Error:", data);
      return reply.code(500).send({ error: "Failed to exchange token" });
    }

    // Fetch user profile from Discord
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${data.access_token}`,
      },
    });

    if (!userResponse.ok) {
      fastify.log.error("Failed to fetch Discord user profile");
      return reply.code(500).send({ error: "Failed to fetch user profile" });
    }

    const user = await userResponse.json();

    // Upsert user into database
    try {
      await pool.query(
        `INSERT INTO discord_users (id, username, avatar) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (id) DO UPDATE SET username = $2, avatar = $3`,
        [user.id, user.username, user.avatar]
      );
    } catch (dbError) {
      console.error("Failed to upsert Discord user:", dbError);
      // Don't fail the request if DB upsert fails
    }

    return { access_token: data.access_token, user };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: "Internal server error" });
  }
});

// Analytics Proxy for Discord (GA4 Measurement Protocol)
fastify.post("/api/analytics", async (request, reply) => {
  const { event_name, params, client_id } = request.body;
  const measurementId = process.env.GA_MEASUREMENT_ID || "G-8V7LKZ4W98";
  const apiSecret = process.env.GA_API_SECRET;

  if (!apiSecret) {
    // Fail silently if no secret configured (dev mode)
    return reply.send({ status: "skipped", reason: "no_api_secret" });
  }

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        client_id: client_id || "anonymous",
        events: [
          {
            name: event_name,
            params: {
              ...params,
              engagement_time_msec: 100, // Default engagement
              session_id: params.session_id || Date.now().toString(), // Simple session tracking
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      fastify.log.error(`GA4 Error: ${response.statusText}`);
    }
    return reply.send({ status: "sent" });
  } catch (error) {
    fastify.log.error(`Analytics proxy error: ${error.message}`);
    return reply.send({ status: "error" });
  }
});

// Removed PATCH /api/guess/name as it is no longer needed

// User Stats and History
fastify.get("/api/user/:userId/stats", async (request, reply) => {
  const { userId } = request.params;

  if (!userId) {
    return reply.code(400).send({ error: "Missing user ID" });
  }

  try {
    // Get user info - check DB first, but don't fail if not found
    const userResult = await pool.query(
      "SELECT id, username, avatar FROM discord_users WHERE id = $1",
      [userId]
    );

    // If user hasn't made any guesses yet, return empty stats
    // The user info will come from the request context (frontend has it from Discord auth)
    const user = userResult.rows[0] || {
      id: userId,
      username: null,
      avatar: null,
    };

    // Get aggregate stats from daily_results
    const statsResult = await pool.query(
      `SELECT 
        COUNT(*) as games_played,
        COUNT(*) FILTER (WHERE won = true) as games_won,
        ROUND(AVG(guesses_count)::numeric, 1) as avg_guesses,
        MIN(guesses_count) FILTER (WHERE won = true) as best_game,
        ROUND(AVG(score)::numeric, 0) as avg_distance
      FROM daily_results 
      WHERE user_id = $1`,
      [userId]
    );

    // Get recent game history (last 10 games)
    const historyResult = await pool.query(
      `SELECT date, score as distance, guesses_count, won
       FROM daily_results 
       WHERE user_id = $1 
       ORDER BY date DESC 
       LIMIT 10`,
      [userId]
    );

    // Get current streak
    const streakResult = await pool.query(
      `WITH dates AS (
        SELECT date, won,
          date - (ROW_NUMBER() OVER (ORDER BY date DESC))::int AS grp
        FROM daily_results
        WHERE user_id = $1 AND won = true
        ORDER BY date DESC
      )
      SELECT COUNT(*) as streak
      FROM dates
      WHERE grp = (SELECT grp FROM dates LIMIT 1)`,
      [userId]
    );

    // Get total guesses made
    const guessCountResult = await pool.query(
      "SELECT COUNT(*) as total_guesses FROM user_guesses WHERE user_id = $1",
      [userId]
    );

    const stats = statsResult.rows[0];
    const streak = streakResult.rows[0]?.streak || 0;
    const totalGuesses = guessCountResult.rows[0]?.total_guesses || 0;

    return {
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
      },
      stats: {
        gamesPlayed: parseInt(stats.games_played) || 0,
        gamesWon: parseInt(stats.games_won) || 0,
        winRate:
          stats.games_played > 0
            ? Math.round((stats.games_won / stats.games_played) * 100)
            : 0,
        avgGuesses: parseFloat(stats.avg_guesses) || 0,
        bestGame: parseInt(stats.best_game) || null,
        avgDistance: parseInt(stats.avg_distance) || 0,
        currentStreak: parseInt(streak) || 0,
        totalGuesses: parseInt(totalGuesses) || 0,
      },
      recentGames: historyResult.rows.map((row) => ({
        date: row.date,
        distance: row.distance,
        guessCount: row.guesses_count,
        won: row.won,
      })),
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: "Failed to fetch user stats" });
  }
});

// Get guesses for a specific day
fastify.get("/api/user/:userId/guesses/:date", async (request, reply) => {
  const { userId, date } = request.params;

  if (!userId || !date) {
    return reply.code(400).send({ error: "Missing user ID or date" });
  }

  try {
    const result = await pool.query(
      `SELECT guess_number, lat, lng, location_name, distance, score, direction, timestamp
       FROM user_guesses 
       WHERE user_id = $1 AND date = $2
       ORDER BY guess_number ASC`,
      [userId, date]
    );

    return { guesses: result.rows };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: "Failed to fetch guesses" });
  }
});

// Haversine formula to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

function toDeg(radians) {
  return radians * (180 / Math.PI);
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const startLat = toRad(lat1);
  const startLon = toRad(lon1);
  const destLat = toRad(lat2);
  const destLon = toRad(lon2);

  let dLon = destLon - startLon;

  // Project latitude difference (Mercator)
  const dPhi = Math.log(
    Math.tan(destLat / 2 + Math.PI / 4) / Math.tan(startLat / 2 + Math.PI / 4)
  );

  // Handle dateline crossing
  if (Math.abs(dLon) > Math.PI) {
    if (dLon > 0) {
      dLon = -(2 * Math.PI - dLon);
    } else {
      dLon = 2 * Math.PI + dLon;
    }
  }

  let brng = Math.atan2(dLon, dPhi);
  brng = toDeg(brng);
  return (brng + 360) % 360;
}

function getCardinalDirection(angle) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(((angle %= 360) < 0 ? angle + 360 : angle) / 45) % 8;
  return directions[index];
}

// Graceful shutdown
const closeGracefully = async (signal) => {
  console.log(`\n⚠️  Received signal to terminate: ${signal}`);
  await pool.end();
  await fastify.close();
  process.exit(0);
};

process.on("SIGINT", closeGracefully);
process.on("SIGTERM", closeGracefully);

// Start server
const start = async () => {
  try {
    // Test database connection
    await pool.query("SELECT NOW()");
    console.log("✅ Database connection successful");

    await fastify.listen({ port: 3001, host: "0.0.0.0" });
    console.log("🚀 Locodle backend running on http://localhost:3001");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
