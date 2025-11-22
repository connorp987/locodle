import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db/connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDb() {
  try {
    const sqlPath = path.join(__dirname, "../db/init.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    console.log("Running database initialization...");
    await pool.query(sql);
    console.log("✅ Database initialized successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error initializing database:", error);
    process.exit(1);
  }
}

initDb();
