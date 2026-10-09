import { getLocationForDate } from "../services/locationGenerator.js";
import { getEasternDateString } from "../utils/locationUtils.js";
import { geocodeLocation } from "../utils/geocoding.js";
import {
  calculateDistance,
  calculateBearing,
  getCardinalDirection,
} from "../utils/calculations.js";
import pool from "../db/connection.js";
import {
  getRegisteredChannelsForGuild,
  postOrUpdateCompletionMessage,
} from "../services/discordBot.js";

const locationCache = new Map();

// Map-click guesses arrive named by their coordinates ("48.8566, 2.3522")
const COORDINATE_NAME = /^-?\d+(\.\d+)?, -?\d+(\.\d+)?$/;

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

export default async function challengeRoutes(fastify) {
  fastify.get("/api/daily-challenge", async (request, reply) => {
    try {
      const { date } = request.query;
      const dailyLocation = await getDailyLocation(date);

      if (!dailyLocation) {
        return reply
          .code(404)
          .send({ error: "No challenge found for this date" });
      }

      return {
        date: date || getEasternDateString(),
        hints: dailyLocation.hints,
        maxGuesses: 6,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: "Failed to load daily challenge" });
    }
  });

  fastify.get("/api/geocode", async (request, reply) => {
    const lat = Number(request.query.lat);
    const lng = Number(request.query.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return reply.code(400).send({ error: "Invalid lat/lng" });
    }

    const result = await geocodeLocation(lat, lng);
    if (!result) {
      return reply.code(502).send({ error: "Couldn't look up this place" });
    }
    return result;
  });

  fastify.post("/api/guess", async (request, reply) => {
    const { guess, date } = request.body;

    if (!guess) {
      return reply.code(400).send({ error: "Missing guess" });
    }

    try {
      // Reverse geocoding is slow (often 0.3-1.5s), so it runs in the
      // background: the guess is scored and returned right away, the client
      // fetches the name from /api/geocode, and the saved row is renamed
      // once the lookup finishes. Search guesses already have a name.
      const needsName = !guess.name || COORDINATE_NAME.test(guess.name);
      const namePromise = needsName
        ? geocodeLocation(guess.lat, guess.lng)
        : null;

      const dailyLocation = await getDailyLocation(date);

      if (!dailyLocation) {
        return reply
          .code(404)
          .send({ error: "No challenge found for this date" });
      }

      const guessName = guess.name;

      const distance = calculateDistance(
        guess.lat,
        guess.lng,
        dailyLocation.lat,
        dailyLocation.lng
      );

      const bearing = calculateBearing(
        guess.lat,
        guess.lng,
        dailyLocation.lat,
        dailyLocation.lng
      );
      const direction = getCardinalDirection(bearing);

      const score = Math.round((100 - (distance / 20000) * 120) * 10) / 10;

      const guessResult = {
        guess: guessName,
        lat: guess.lat,
        lng: guess.lng,
        distance: Math.round(distance),
        score: score,
        bearing: Math.round(bearing),
        direction: direction,
        timestamp: new Date().toISOString(),
        address: null,
        pendingName: needsName,
      };

      const won = distance < 50;
      const completed = won;

      if (request.body.discord_user_id) {
        const { discord_user_id, username, avatar } = request.body;
        let { guild_id } = request.body;
        const gameDate = date || getEasternDateString();

        try {
          if (!guild_id) {
            const existingUser = await pool.query(
              "SELECT guild_id FROM discord_users WHERE id = $1 AND guild_id IS NOT NULL",
              [discord_user_id]
            );
            if (existingUser.rows.length > 0) {
              guild_id = existingUser.rows[0].guild_id;
            }
          }

          if (guild_id) {
            await pool.query(
              `INSERT INTO discord_users (id, username, avatar, guild_id) 
               VALUES ($1, $2, $3, $4) 
               ON CONFLICT (id) DO UPDATE SET username = $2, avatar = $3, guild_id = $4`,
              [discord_user_id, username, avatar, guild_id]
            );
          } else {
            await pool.query(
              `INSERT INTO discord_users (id, username, avatar) 
               VALUES ($1, $2, $3) 
               ON CONFLICT (id) DO UPDATE SET username = $2, avatar = $3`,
              [discord_user_id, username, avatar]
            );
          }

          const currentGameMode = request.body.gameMode || "hard";

          const inserted = await pool.query(
            `INSERT INTO user_guesses (user_id, date, guess_number, lat, lng, location_name, distance, score, direction, game_mode)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [
              discord_user_id,
              gameDate,
              request.body.guessCount || 1,
              guess.lat,
              guess.lng,
              guessName,
              Math.round(distance),
              score,
              direction,
              currentGameMode,
            ]
          );

          if (namePromise) {
            const guessId = inserted.rows[0].id;
            namePromise
              .then((result) => {
                if (!result?.name) return;
                return pool.query(
                  "UPDATE user_guesses SET location_name = $1 WHERE id = $2",
                  [result.name, guessId]
                );
              })
              .catch((err) =>
                fastify.log.error(err, "Failed to save geocoded guess name")
              );
          }

          if (won) {
            try {
              const gameMode = request.body.gameMode || "hard";

              // Count how many guesses were made in easy mode
              const easyGuessesResult = await pool.query(
                `SELECT COUNT(*) as easy_count FROM user_guesses 
                 WHERE user_id = $1 AND date = $2 AND game_mode = 'easy'`,
                [discord_user_id, gameDate]
              );
              const easyGuessesCount =
                parseInt(easyGuessesResult.rows[0].easy_count) || 0;

              await pool.query(
                `INSERT INTO daily_results (user_id, guild_id, date, score, guesses_count, won, game_mode, easy_guesses_count)
                 VALUES ($1, $2, $3, $4, $5, true, $6, $7)
                 ON CONFLICT (user_id, date) DO UPDATE SET score = $4, guesses_count = $5, won = true, guild_id = $2, game_mode = $6, easy_guesses_count = $7`,
                [
                  discord_user_id,
                  guild_id,
                  gameDate,
                  Math.round(distance),
                  request.body.guessCount || 1,
                  gameMode,
                  easyGuessesCount,
                ]
              );

              // Discord posts don't affect the response; don't make the
              // player wait on them
              if (guild_id) {
                (async () => {
                  const channels = await getRegisteredChannelsForGuild(
                    guild_id
                  );
                  for (const channelId of channels) {
                    await postOrUpdateCompletionMessage(
                      channelId,
                      guild_id,
                      discord_user_id,
                      username,
                      request.body.guessCount || 1,
                      true,
                      gameDate
                    );
                  }
                })().catch((err) =>
                  fastify.log.error(err, "Failed to post completion message")
                );
              }
            } catch (dbError) {
              fastify.log.error(
                "Failed to save daily result or post message:",
                dbError
              );
            }
          }
        } catch (dbError) {
          console.error("Failed to save guess:", dbError);
        }
      }

      return {
        ...guessResult,
        completed: completed,
        won: won,
        answer: completed
          ? {
              name: dailyLocation.name,
              lat: dailyLocation.lat,
              lng: dailyLocation.lng,
              country: dailyLocation.country,
              hints: dailyLocation.hints,
            }
          : null,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: "Failed to process guess" });
    }
  });
}
