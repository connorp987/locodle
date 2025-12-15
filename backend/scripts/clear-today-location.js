import pool from "../db/connection.js";

// Get today's date in Eastern Time
function getEasternDateString() {
  const now = new Date();
  const eastern = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  return eastern.toISOString().split("T")[0];
}

async function clearTodayLocation() {
  const today = getEasternDateString();
  console.log(`Clearing data for date: ${today}`);

  try {
    // Delete user guesses for today
    const guessesResult = await pool.query(
      "DELETE FROM user_guesses WHERE date = $1 RETURNING *",
      [today]
    );
    console.log(`✅ Deleted ${guessesResult.rowCount} user guess(es)`);

    // Delete daily results for today
    const resultsResult = await pool.query(
      "DELETE FROM daily_results WHERE date = $1 RETURNING *",
      [today]
    );
    console.log(`✅ Deleted ${resultsResult.rowCount} daily result(s)`);

    // Delete location for today
    const locResult = await pool.query(
      "DELETE FROM locations WHERE game_date = $1 AND id > 15 RETURNING *",
      [today]
    );

    if (locResult.rows.length > 0) {
      console.log(`✅ Deleted ${locResult.rows.length} location(s):`);
      locResult.rows.forEach((loc) =>
        console.log(`   - ${loc.name}, ${loc.country}`)
      );
    } else {
      console.log("No locations found for today.");
    }

    await pool.end();
  } catch (error) {
    console.error("Error:", error);
    await pool.end();
    process.exit(1);
  }
}

clearTodayLocation();
