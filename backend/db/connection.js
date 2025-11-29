import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;
// Only use SSL if explicitly in production mode
const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://locodle:locodle_dev_password@localhost:5432/locodle",
  ssl: isProduction
    ? {
        rejectUnauthorized: false,
      }
    : false,
});

// Test connection
pool.on("connect", () => {
  console.log("✅ Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle client", err);
  process.exit(-1);
});

export default pool;
