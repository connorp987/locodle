import pool from "../db/connection.js";

async function checkLocations() {
  try {
    // Check all locations
    const result = await pool.query(
      "SELECT id, name, game_date, DATE(created_at) as created_date, is_active FROM locations ORDER BY id LIMIT 30"
    );

    console.log("Current locations in database:");
    console.log("ID | Name | game_date | created_date | is_active");
    console.log("-".repeat(80));
    result.rows.forEach((row) => {
      console.log(
        `${row.id} | ${row.name} | ${row.game_date} | ${row.created_date} | ${row.is_active}`
      );
    });

    await pool.end();
  } catch (error) {
    console.error("Error:", error);
    await pool.end();
    process.exit(1);
  }
}

checkLocations();
