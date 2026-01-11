import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import pool from "./db/connection.js";
import { initDiscordBot } from "./services/discordBot.js";
import healthRoutes from "./routes/health.js";
import challengeRoutes from "./routes/challenge.js";
import userRoutes from "./routes/user.js";
import discordRoutes from "./routes/discord.js";
import analyticsRoutes from "./routes/analytics.js";
import tilesRoutes from "./routes/tiles.js";

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
  timeWindow: 60 * 1000,
});

// Register route modules
await fastify.register(healthRoutes);
await fastify.register(challengeRoutes);
await fastify.register(userRoutes);
await fastify.register(discordRoutes);
await fastify.register(analyticsRoutes);
await fastify.register(tilesRoutes);

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
