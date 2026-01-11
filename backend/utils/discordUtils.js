import pool from "../db/connection.js";

export function getETDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function getServerStreak(guildId) {
  try {
    const result = await pool.query(
      `SELECT current_streak, last_completion_date FROM server_streaks WHERE guild_id = $1`,
      [guildId]
    );

    if (result.rows.length === 0) {
      return { currentStreak: 0, lastCompletionDate: null };
    }

    return {
      currentStreak: result.rows[0].current_streak || 0,
      lastCompletionDate: result.rows[0].last_completion_date,
    };
  } catch (error) {
    console.error("Failed to get server streak:", error);
    return { currentStreak: 0, lastCompletionDate: null };
  }
}

export async function updateServerStreak(guildId, completionDate) {
  try {
    const streak = await getServerStreak(guildId);
    const lastDate = streak.lastCompletionDate;

    if (lastDate && lastDate === completionDate) {
      return streak.currentStreak;
    }

    let newStreak = 1;

    if (lastDate) {
      const last = new Date(lastDate);
      const current = new Date(completionDate);
      const diffTime = current - last;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        newStreak = streak.currentStreak + 1;
      } else if (diffDays > 1) {
        newStreak = 1;
      } else {
        newStreak = streak.currentStreak;
      }
    }

    await pool.query(
      `INSERT INTO server_streaks (guild_id, current_streak, last_completion_date, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (guild_id) 
       DO UPDATE SET current_streak = $2, last_completion_date = $3, updated_at = CURRENT_TIMESTAMP`,
      [guildId, newStreak, completionDate]
    );

    console.log(
      `✅ Updated server streak for guild ${guildId}: ${newStreak} days`
    );
    return newStreak;
  } catch (error) {
    console.error("Failed to update server streak:", error);
    return 0;
  }
}
