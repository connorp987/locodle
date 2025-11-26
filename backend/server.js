import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import {
  getLocationForDate,
  getAvailableDates,
} from "./services/locationGenerator.js";
import pool from "./db/connection.js";

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
  max: 20,
  timeWindow: 60 * 1000, // 1 minute
});

// Cache for today's location to avoid repeated DB queries
let cachedLocation = null;
let cacheDate = null;

// Get daily location (same for all players on a given day)
async function getDailyLocation(date = null) {
  const targetDate = date || new Date().toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  // Return cached location if it's still today and we're requesting today
  if (!date && cachedLocation && cacheDate === today) {
    return cachedLocation;
  }

  // Get or generate location from database
  const location = await getLocationForDate(targetDate);
  
  // Only cache if it's today's location
  if (!date || targetDate === today) {
    cachedLocation = location;
    cacheDate = today;
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
      return reply.code(404).send({ error: "No challenge found for this date" });
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
    const dailyLocation = await getDailyLocation(date);

    if (!dailyLocation) {
      return reply.code(404).send({ error: "No challenge found for this date" });
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

    // Fetch location name from Nominatim
    let guessName = guess.name;
    let guessAddress = null;
    try {
      const nominatimRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${guess.lat}&lon=${guess.lng}&addressdetails=1`,
        { headers: { "User-Agent": "Locodle/1.0" } }
      );
      const nominatimData = await nominatimRes.json();
      if (nominatimData.display_name) {
        guessName = nominatimData.display_name;
      }
      if (nominatimData.address) {
        guessAddress = nominatimData.address;
      }
    } catch (err) {
      console.error("Failed to fetch location name from Nominatim:", err);
      // Fallback to coordinate name if fetch fails, which is already in guess.name
    }

    const guessResult = {
      guess: guessName,
      lat: guess.lat,
      lng: guess.lng,
      distance: Math.round(distance),
      bearing: Math.round(bearing),
      direction: direction,
      timestamp: new Date().toISOString(),
      address: guessAddress,
    };

    // Check if won (within 50km)
    const won = distance < 50;
    const completed = won || isLastGuess; // Game over if won or it's the last guess

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
    if (!response.ok) throw new Error(`Tile fetch failed: ${response.statusText}`);
    
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
  const { code } = request.body;
  
  if (!code) {
    return reply.code(400).send({ error: "Missing code" });
  }

  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      fastify.log.error("Discord Token Error:", data);
      return reply.code(500).send({ error: "Failed to exchange token" });
    }

    return { access_token: data.access_token };
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
        events: [{
          name: event_name,
          params: {
            ...params,
            engagement_time_msec: 100, // Default engagement
            session_id: params.session_id || Date.now().toString(), // Simple session tracking
          },
        }],
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

// Removed stats endpoint as state is now client-side

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
  const dPhi = Math.log(Math.tan(destLat / 2 + Math.PI / 4) / Math.tan(startLat / 2 + Math.PI / 4));

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
