import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db/connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDb() {
  try {
    const dbUrl = process.env.DATABASE_URL || "local";
    console.log(`Using database: ${dbUrl.includes("@") ? dbUrl.split("@")[1] : dbUrl}`);

    // 1. Run init.sql (Base Schema)
    const initSqlPath = path.join(__dirname, "../db/init.sql");
    const initSql = fs.readFileSync(initSqlPath, "utf8");

    console.log("Running base database initialization...");
    await pool.query(initSql);
    console.log("✅ Base schema initialized");

    // 2. Run Migrations
    const migrationsDir = path.join(__dirname, "../db/migrations");
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).sort(); // Ensure order
      
      for (const file of files) {
        if (file.endsWith(".sql")) {
          console.log(`Running migration: ${file}`);
          const migrationSql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
          await pool.query(migrationSql);
          console.log(`✅ Migration ${file} applied`);
        }
      }
    }

    console.log("✅ Database initialization complete");
    process.exit(0);
  } catch (error) {
    console.error("❌ FATAL ERROR initializing database:");
    console.error(error.message);
    if (error.stack) console.error(error.stack);
    // Ensure we exit with 1 so the build fails explicitly
    process.exit(1);
  }
}

initDb();
