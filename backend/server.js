import Fastify from "fastify";
import cors from "@fastify/cors";
import { locations } from "./data/locations.js";

const fastify = Fastify({
  logger: true,
});

// Enable CORS for frontend
await fastify.register(cors, {
  origin: ["http://localhost:3000", "http://localhost:5173"],
});

// Game state management
const gameState = new Map();

// Get daily location (same for all players on a given day)
function getDailyLocation() {
  const today = new Date().toISOString().split("T")[0];
  const daysSinceEpoch = Math.floor(
    new Date(today).getTime() / (1000 * 60 * 60 * 24)
  );
  const index = daysSinceEpoch % locations.length;
  return locations[index];
}

// Routes
fastify.get("/api/health", async (request, reply) => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

fastify.get("/api/daily-challenge", async (request, reply) => {
  const dailyLocation = getDailyLocation();

  // Return location without revealing the answer
  return {
    date: new Date().toISOString().split("T")[0],
    hints: dailyLocation.hints,
    maxGuesses: 6,
  };
});

fastify.post("/api/guess", async (request, reply) => {
  const { guess, sessionId } = request.body;

  if (!guess || !sessionId) {
    return reply.code(400).send({ error: "Missing guess or sessionId" });
  }

  const dailyLocation = getDailyLocation();

  // Get or create session state
  if (!gameState.has(sessionId)) {
    gameState.set(sessionId, {
      guesses: [],
      completed: false,
      won: false,
    });
  }

  const session = gameState.get(sessionId);

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
});

fastify.get("/api/stats/:sessionId", async (request, reply) => {
  const { sessionId } = request.params;

  const session = gameState.get(sessionId) || {
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

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: "0.0.0.0" });
    console.log("🚀 Locodle backend running on http://localhost:3001");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
