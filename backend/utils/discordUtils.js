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
      [guildId],
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
    const lastDateRaw = streak.lastCompletionDate;
    // Normalize to "YYYY-MM-DD" string. pg returns DATE as a Date object in
    // server-local time, so using toISOString() can shift the day. Build the
    // string from local Y/M/D components instead.
    const toYMD = (d) => {
      if (!d) return null;
      if (typeof d === "string") return d.slice(0, 10);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const lastDate = toYMD(lastDateRaw);

    if (lastDate && lastDate === completionDate) {
      return streak.currentStreak;
    }

    let newStreak = 1;

    if (lastDate) {
      // Parse as UTC to avoid DST/local-offset drift.
      const last = new Date(`${lastDate}T00:00:00Z`);
      const current = new Date(`${completionDate}T00:00:00Z`);
      const diffDays = Math.round((current - last) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        newStreak = streak.currentStreak + 1;
      } else if (diffDays > 1) {
        newStreak = 1;
      } else {
        // diffDays <= 0 shouldn't happen given the equality check above,
        // but keep the streak stable if it does.
        newStreak = streak.currentStreak;
      }
    }

    await pool.query(
      `INSERT INTO server_streaks (guild_id, current_streak, last_completion_date, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (guild_id) 
       DO UPDATE SET current_streak = $2, last_completion_date = $3, updated_at = CURRENT_TIMESTAMP`,
      [guildId, newStreak, completionDate],
    );

    console.log(
      `✅ Updated server streak for guild ${guildId}: ${newStreak} days`,
    );
    return newStreak;
  } catch (error) {
    console.error("Failed to update server streak:", error);
    return 0;
  }
}
