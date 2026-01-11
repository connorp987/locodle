import { getLocationForDate } from "../services/locationGenerator.js";
import { getEasternDateString } from "../utils/locationUtils.js";
import pool from "../db/connection.js";

const locationCache = new Map();

async function getDailyLocation(date = null) {
  const targetDate = date || getEasternDateString();

  if (locationCache.has(targetDate)) {
    return locationCache.get(targetDate);
  }

  const location = await getLocationForDate(targetDate);

  if (location) {
    locationCache.set(targetDate, location);
  }

  return location;
}

export default async function userRoutes(fastify) {
  fastify.get("/api/user/:userId/stats", async (request, reply) => {
    const { userId } = request.params;

    if (!userId) {
      return reply.code(400).send({ error: "Missing user ID" });
    }

    try {
      const userResult = await pool.query(
        "SELECT id, username, avatar FROM discord_users WHERE id = $1",
        [userId]
      );

      const user = userResult.rows[0] || {
        id: userId,
        username: null,
        avatar: null,
      };

      const statsResult = await pool.query(
        `SELECT 
          COUNT(*) as games_played,
          COUNT(*) FILTER (WHERE won = true) as games_won,
          ROUND(AVG(guesses_count)::numeric, 1) as avg_guesses,
          MIN(guesses_count) FILTER (WHERE won = true) as best_game,
          ROUND(AVG(score)::numeric, 0) as avg_distance
        FROM daily_results 
        WHERE user_id = $1`,
        [userId]
      );

      const historyResult = await pool.query(
        `SELECT date, score as distance, guesses_count, won
         FROM daily_results 
         WHERE user_id = $1 
         ORDER BY date DESC 
         LIMIT 10`,
        [userId]
      );

      const streakResult = await pool.query(
        `WITH dates AS (
          SELECT date, won,
            date - (ROW_NUMBER() OVER (ORDER BY date DESC))::int AS grp
          FROM daily_results
          WHERE user_id = $1 AND won = true
          ORDER BY date DESC
        )
        SELECT COUNT(*) as streak
        FROM dates
        WHERE grp = (SELECT grp FROM dates LIMIT 1)`,
        [userId]
      );

      const guessCountResult = await pool.query(
        "SELECT COUNT(*) as total_guesses FROM user_guesses WHERE user_id = $1",
        [userId]
      );

      const stats = statsResult.rows[0];
      const streak = streakResult.rows[0]?.streak || 0;
      const totalGuesses = guessCountResult.rows[0]?.total_guesses || 0;

      return {
        user: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
        },
        stats: {
          gamesPlayed: parseInt(stats.games_played) || 0,
          gamesWon: parseInt(stats.games_won) || 0,
          winRate:
            stats.games_played > 0
              ? Math.round((stats.games_won / stats.games_played) * 100)
              : 0,
          avgGuesses: parseFloat(stats.avg_guesses) || 0,
          bestGame: parseInt(stats.best_game) || null,
          avgDistance: parseInt(stats.avg_distance) || 0,
          currentStreak: parseInt(streak) || 0,
          totalGuesses: parseInt(totalGuesses) || 0,
        },
        recentGames: historyResult.rows.map((row) => ({
          date: row.date,
          distance: row.distance,
          guessCount: row.guesses_count,
          won: row.won,
        })),
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: "Failed to fetch user stats" });
    }
  });

  fastify.get("/api/user/:userId/guesses/:date", async (request, reply) => {
    const { userId, date } = request.params;

    if (!userId || !date) {
      return reply.code(400).send({ error: "Missing user ID or date" });
    }

    try {
      const result = await pool.query(
        `SELECT guess_number, lat, lng, location_name, distance, score, direction, timestamp
         FROM user_guesses 
         WHERE user_id = $1 AND date = $2
         ORDER BY guess_number ASC`,
        [userId, date]
      );

      const guesses = result.rows;
      let answer = null;

      const hasWon = guesses.some((g) => g.distance < 50);
      if (hasWon) {
        const dailyLocation = await getDailyLocation(date);
        if (dailyLocation) {
          answer = {
            name: dailyLocation.name,
            lat: dailyLocation.lat,
            lng: dailyLocation.lng,
          };
        }
      }

      return { guesses, answer };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: "Failed to fetch guesses" });
    }
  });
}
