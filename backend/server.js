import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  getTodaysLocation,
  getGameSession,
  saveGameSession,
} from "./services/locationGenerator.js";
import pool from "./db/connection.js";

const fastify = Fastify({
  logger: true,
});

// Enable CORS for frontend
await fastify.register(cors, {
  origin: ["http://localhost:3000", "http://localhost:5173"],
});

// Cache for today's location to avoid repeated DB queries
let cachedLocation = null;
let cacheDate = null;

// Get daily location (same for all players on a given day)
async function getDailyLocation() {
  const today = new Date().toISOString().split("T")[0];

  // Return cached location if it's still today
  if (cachedLocation && cacheDate === today) {
    return cachedLocation;
  }

  // Get or generate location from database
  const location = await getTodaysLocation();
  cachedLocation = location;
  cacheDate = today;

  return location;
}

// Routes
fastify.get("/api/health", async (request, reply) => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

fastify.get("/api/daily-challenge", async (request, reply) => {
  try {
    const dailyLocation = await getDailyLocation();

    // Return location without revealing the answer
    return {
      date: new Date().toISOString().split("T")[0],
      hints: dailyLocation.hints,
      maxGuesses: 6,
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: "Failed to load daily challenge" });
  }
});

fastify.post("/api/guess", async (request, reply) => {
  const { guess, sessionId } = request.body;

  if (!guess || !sessionId) {
    return reply.code(400).send({ error: "Missing guess or sessionId" });
  }

  try {
    const dailyLocation = await getDailyLocation();

    // Get or create session state from database
    let session = await getGameSession(sessionId);

    if (!session) {
      session = {
        guesses: [],
        completed: false,
        won: false,
      };
    }

    if (session.completed) {
      return reply.code(400).send({ error: "Game already completed" });
    }

    if (session.guesses.length >= 6) {
      return reply.code(400).send({ error: "Maximum guesses reached" });
    }

    // Calculate distance between guess and actual location
    const distance = calculateDistance(
      guess.lat,
      guess.lng,
      dailyLocation.lat,
      dailyLocation.lng
    );

    const guessResult = {
      guess: guess.name,
      lat: guess.lat,
      lng: guess.lng,
      distance: Math.round(distance),
      timestamp: new Date().toISOString(),
    };

    session.guesses.push(guessResult);

    // Check if won (within 50km)
    const won = distance < 50;

    if (won || session.guesses.length >= 6) {
      session.completed = true;
      session.won = won;
    }

    // Save session to database
    await saveGameSession(
      sessionId,
      dailyLocation.id,
      session.guesses,
      session.completed,
      session.won
    );

    return {
      ...guessResult,
      guessNumber: session.guesses.length,
      maxGuesses: 6,
      completed: session.completed,
      won: session.won,
      answer: session.completed
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

fastify.get("/api/stats/:sessionId", async (request, reply) => {
  const { sessionId } = request.params;

  try {
    const session = (await getGameSession(sessionId)) || {
      guesses: [],
      completed: false,
      won: false,
    };

    return {
      guesses: session.guesses,
      completed: session.completed,
      won: session.won,
      guessCount: session.guesses.length,
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: "Failed to load stats" });
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
