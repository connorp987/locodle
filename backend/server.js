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

    // Fetch location name from Nominatim
    let guessName = guess.name;
    try {
      const nominatimRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${guess.lat}&lon=${guess.lng}`,
        { headers: { "User-Agent": "Locodle/1.0" } }
      );
      const nominatimData = await nominatimRes.json();
      if (nominatimData.display_name) {
        guessName = nominatimData.display_name;
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
      timestamp: new Date().toISOString(),
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
