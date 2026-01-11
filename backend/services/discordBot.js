import {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  Routes,
} from "discord.js";
import cron from "node-cron";
import pool from "../db/connection.js";
import { getLocationForDate } from "./locationGenerator.js";

let client = null;

// Time to post daily summary (default: 9:30 AM Eastern)
const SUMMARY_HOUR = process.env.DISCORD_SUMMARY_HOUR || "9";
const SUMMARY_MINUTE = process.env.DISCORD_SUMMARY_MINUTE || "30";

export const initDiscordBot = async () => {
  if (client) {
    return client;
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.log("⚠️ No DISCORD_BOT_TOKEN found, skipping bot initialization.");
    return;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      // Removed MessageContent/GuildMessages to avoid "Disallowed Intents" error
      // We will use Slash Commands instead, which don't require these privileged intents
    ],
  });

  client.once(Events.ClientReady, async (c) => {
    console.log(
      `🤖 Discord Bot ready! [PID: ${process.pid}] Logged in as ${c.user.tag}`
    );

    // Register Slash Commands
    try {
      const commands = await c.application.commands.fetch();
      const commandNames = commands.map((cmd) => cmd.name);

      // Register /leaderboard
      if (!commandNames.includes("leaderboard")) {
        await c.application.commands.create({
          name: "leaderboard",
          description: "Show today's Locodle leaderboard for this server",
        });
        console.log("✅ Slash Command '/leaderboard' registered");
      }

      // Register /join
      if (!commandNames.includes("join")) {
        await c.application.commands.create({
          name: "join",
          description: "Register this channel for daily Locodle summaries",
        });
        console.log("✅ Slash Command '/join' registered");
      }

      // Register /leave
      if (!commandNames.includes("leave")) {
        await c.application.commands.create({
          name: "leave",
          description: "Unregister this channel from daily Locodle summaries",
        });
        console.log("✅ Slash Command '/leave' registered");
      }

      console.log("✅ All slash commands ready");
    } catch (error) {
      console.error("❌ Failed to register commands:", error);
    }

    // Schedule daily summary post to all registered channels
    const cronExpression = `${SUMMARY_MINUTE} ${SUMMARY_HOUR} * * *`;

    cron.schedule(
      cronExpression,
      async () => {
        console.log("📊 Running scheduled daily summaries...");
        await postDailySummaryToAllChannels();
      },
      {
        timezone: "America/New_York",
      }
    );

    console.log(
      `📅 Daily summaries scheduled for ${SUMMARY_HOUR}:${SUMMARY_MINUTE.padStart(
        2,
        "0"
      )} Eastern`
    );

    // Pre-generate today's location at 12:15 AM Eastern
    cron.schedule(
      "15 0 * * *",
      async () => {
        const now = new Date();
        const eastern = new Date(
          now.toLocaleString("en-US", { timeZone: "America/New_York" })
        );
        const today = eastern.toISOString().split("T")[0];
        console.log(`🌍 Pre-generating location for ${today}...`);
        try {
          await getLocationForDate(today);
          console.log(`✅ Location for ${today} is ready.`);
        } catch (error) {
          console.error(
            `❌ Failed to pre-generate location for ${today}:`,
            error
          );
        }
      },
      {
        timezone: "America/New_York",
      }
    );
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    // Add a tracking set to prevent multiple responses to the same interaction ID within this process
    if (!client.handledInteractions) client.handledInteractions = new Set();
    if (client.handledInteractions.has(interaction.id)) return;

    // Handle Button Interactions
    if (interaction.isButton()) {
      if (interaction.customId === "play_locodle") {
        console.log(
          `[PID: ${process.pid}] Play button clicked by ${interaction.user.tag}`
        );

        try {
          if (interaction.replied || interaction.deferred) return;
          client.handledInteractions.add(interaction.id);

          // Use the raw API to respond with type 12 (LAUNCH_ACTIVITY)
          await interaction.client.rest.post(
            Routes.interactionCallback(interaction.id, interaction.token),
            { body: { type: 12 } }
          );

          console.log(
            `[PID: ${process.pid}] Successfully sent LAUNCH_ACTIVITY response.`
          );
        } catch (error) {
          // If we get an "Unknown Interaction" error, it's almost certainly because
          // another bot process handled it first.
          if (error.code === 10062) {
            console.warn(
              `[PID: ${process.pid}] Interaction ${interaction.id} already handled by another instance.`
            );
            return;
          }

          console.error(
            `[PID: ${process.pid}] Error launching activity:`,
            error
          );

          // Fallback only if we haven't replied yet and it's not a race condition
          try {
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({
                content:
                  "🌍 **Launch Locodle Activity**\n\nClick here to play: https://discord.com/activities/1442219897131368508",
                flags: [MessageFlags.Ephemeral],
              });
            }
          } catch (innerError) {
            // Silently ignore if this also fails due to the same race condition
          }
        } finally {
          // Clean up the tracking set after a delay
          setTimeout(
            () => client.handledInteractions?.delete(interaction.id),
            10000
          );
        }
        return;
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    // /join command - register this channel for daily summaries
    if (interaction.commandName === "join") {
      try {
        if (interaction.replied || interaction.deferred) return;
        await interaction.deferReply();

        let guildName = interaction.guild?.name;
        let channelName = interaction.channel?.name;

        // If guild name is missing, try fetching the guild
        if (!guildName && guildId) {
          try {
            const guild = await client.guilds.fetch(guildId);
            guildName = guild?.name;
          } catch (fetchError) {
            console.error("Failed to fetch guild:", fetchError);
          }
        }

        guildName = guildName || "Unknown Server";
        channelName = channelName || "Unknown Channel";

        // Insert or update channel registration
        await pool.query(
          `INSERT INTO discord_channels (channel_id, guild_id, guild_name, channel_name, is_active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (channel_id) DO UPDATE SET is_active = true, guild_name = $3, channel_name = $4`,
          [channelId, guildId, guildName, channelName]
        );

        const playButton = new ButtonBuilder()
          .setLabel("Play Today's Challenge")
          .setStyle(ButtonStyle.Primary)
          .setCustomId("play_locodle")
          .setEmoji("🌍");

        const row = new ActionRowBuilder().addComponents(playButton);

        await interaction.editReply({
          content:
            `✅ **Locodle joined!**\n\n` +
            `This channel will receive daily summaries at ${SUMMARY_HOUR}:${SUMMARY_MINUTE.padStart(
              2,
              "0"
            )} AM Eastern (showing yesterday's results).\n` +
            `Only players from **${guildName}** will appear on your leaderboard.\n\n` +
            `Use \`/leaderboard\` to see today's scores!`,
          components: [row],
        });
      } catch (error) {
        console.error("Join error:", error);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("❌ Failed to register channel.");
        }
      }
      return;
    }

    // /leave command - unregister this channel
    if (interaction.commandName === "leave") {
      try {
        if (interaction.replied || interaction.deferred) return;
        await interaction.deferReply();

        await pool.query(
          `UPDATE discord_channels SET is_active = false WHERE channel_id = $1`,
          [channelId]
        );

        await interaction.editReply(
          `👋 **Locodle left!**\n\nThis channel will no longer receive daily summaries.`
        );
      } catch (error) {
        console.error("Leave error:", error);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("❌ Failed to unregister channel.");
        }
      }
      return;
    }

    // /leaderboard command - show today's leaderboard for this server
    if (interaction.commandName === "leaderboard") {
      try {
        if (interaction.replied || interaction.deferred) return;
        await interaction.deferReply();

        // Get today's date in Eastern Time
        const now = new Date();
        const eastern = new Date(
          now.toLocaleString("en-US", { timeZone: "America/New_York" })
        );
        const today = eastern.toISOString().split("T")[0];

        // Query top 10 results for today, filtered by guild_id
        const result = await pool.query(
          `SELECT u.id as user_id, u.username, r.score, r.guesses_count, r.won
           FROM daily_results r
           JOIN discord_users u ON r.user_id = u.id
           WHERE r.date = $1 AND r.guild_id = $2
           ORDER BY r.won DESC, r.guesses_count ASC, r.score ASC
           LIMIT 10`,
          [today, guildId]
        );

        if (result.rows.length === 0) {
          await interaction.editReply(
            `🏆 **Today's Leaderboard**\nNo results yet from this server! Be the first to play.`
          );
          return;
        }

        let leaderboardMsg = `🏆 **Leaderboard for ${today}**\n\n`;

        result.rows.forEach((row, index) => {
          const rank = index + 1;
          const medal =
            rank === 1
              ? "🥇"
              : rank === 2
              ? "🥈"
              : rank === 3
              ? "🥉"
              : `#${rank}`;
          const status = row.won ? "✅" : "❌";
          leaderboardMsg += `${medal} <@${row.user_id}> ${status} - ${row.guesses_count} guesses (${row.score}km)\n`;
        });

        const playButton = new ButtonBuilder()
          .setLabel("Play Today's Challenge")
          .setStyle(ButtonStyle.Primary)
          .setCustomId("play_locodle")
          .setEmoji("🌍");

        const row = new ActionRowBuilder().addComponents(playButton);

        await interaction.editReply({
          content: leaderboardMsg,
          components: [row],
        });
      } catch (error) {
        console.error("Leaderboard error:", error);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("❌ Failed to fetch leaderboard.");
        } else {
          console.log(
            "Could not reply to interaction (likely timed out or unknown)."
          );
        }
      }
    }
  });

  try {
    await client.login(token);
  } catch (error) {
    console.error("❌ Failed to login Discord Bot:", error.message);
  }
};

export const postDailyResult = async (channelId, result) => {
  if (!client || !client.isReady()) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      const emoji = result.won ? "🎉" : "💀";
      await channel.send(
        `${emoji} **${result.username}** finished today's Locodle!\n` +
          `Guesses: ${result.guesses_count}/6 | Distance: ${result.score}km`
      );
    }
  } catch (error) {
    console.error("❌ Failed to post result:", error.message);
  }
};

// Helper to get ET date string (YYYY-MM-DD)
function getETDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Get current server streak for a guild
async function getServerStreak(guildId) {
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

// Update server streak when someone completes the daily challenge
async function updateServerStreak(guildId, completionDate) {
  try {
    const streak = await getServerStreak(guildId);
    const lastDate = streak.lastCompletionDate;

    // If this is the same date as last completion, don't update
    if (lastDate && lastDate === completionDate) {
      return streak.currentStreak;
    }

    let newStreak = 1;

    if (lastDate) {
      // Parse dates and check if they're consecutive
      const last = new Date(lastDate);
      const current = new Date(completionDate);
      const diffTime = current - last;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Consecutive day - increment streak
        newStreak = streak.currentStreak + 1;
      } else if (diffDays > 1) {
        // Streak broken - reset to 1
        newStreak = 1;
      } else {
        // Same day or past date - keep current streak
        newStreak = streak.currentStreak;
      }
    }

    // Update or insert the streak
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

// Post daily summary to all registered channels
async function postDailySummaryToAllChannels() {
  if (!client || !client.isReady()) {
    console.log("Cannot post daily summaries: bot not ready");
    return;
  }

  try {
    // Get all active registered channels
    const channelsResult = await pool.query(
      "SELECT channel_id, guild_id, guild_name FROM discord_channels WHERE is_active = true"
    );

    if (channelsResult.rows.length === 0) {
      console.log("No registered channels for daily summaries");
      return;
    }

    // Get yesterday's date in Eastern Time (so we don't spoil today's challenge)
    const now = new Date();
    // Subtract 24 hours to get yesterday
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = getETDateString(yesterday);

    console.log(`📊 Generating daily summary for ${yesterdayStr} (ET)...`);

    // Get yesterday's location using the same function as the main app
    const location = await getLocationForDate(yesterdayStr);
    const locationName = location
      ? `${location.name}, ${location.country}`
      : "Unknown Location";

    // Post to each registered channel
    for (const channelRow of channelsResult.rows) {
      try {
        const channel = await client.channels.fetch(channelRow.channel_id);
        if (!channel || !channel.isTextBased()) {
          console.log(
            `Channel ${channelRow.channel_id} not found or not text-based`
          );
          continue;
        }

        // Get results for this guild only (include user_id for mentions)
        const result = await pool.query(
          `SELECT u.id as user_id, u.username, r.score, r.guesses_count, r.won
           FROM daily_results r
           JOIN discord_users u ON r.user_id = u.id
           WHERE r.date = $1 AND r.guild_id = $2
           ORDER BY r.won DESC, r.guesses_count ASC, r.score ASC`,
          [yesterdayStr, channelRow.guild_id]
        );

        // Get server streak from the simple streak table
        const streakData = await getServerStreak(channelRow.guild_id);
        const serverStreak = streakData.currentStreak;

        let summaryMsg = `📊 **Yesterday's Results (${yesterdayStr})**\n`;
        summaryMsg += `📍 Location: **${locationName}**\n`;

        if (serverStreak > 0) {
          const fireEmoji = serverStreak >= 5 ? "🔥" : "✨";
          summaryMsg += `🔥 **Server Streak: ${serverStreak} days** ${fireEmoji}\n`;
        }
        summaryMsg += `\n`;

        if (result.rows.length === 0) {
          summaryMsg += `No one from this server played yesterday! 😢`;
        } else {
          const winners = result.rows.filter((r) => r.won);
          const avgGuesses =
            result.rows.reduce((sum, r) => sum + r.guesses_count, 0) /
            result.rows.length;

          summaryMsg += `🏆 **Winners:** ${winners.length}/${result.rows.length}\n`;
          summaryMsg += `📈 **Avg Guesses:** ${avgGuesses.toFixed(1)}\n\n`;

          summaryMsg += `**Leaderboard:**\n`;
          result.rows.forEach((row, index) => {
            const rank = index + 1;
            const medal =
              rank === 1
                ? "🥇"
                : rank === 2
                ? "🥈"
                : rank === 3
                ? "🥉"
                : `#${rank}`;
            const status = row.won ? "✅" : "❌";
            summaryMsg += `${medal} <@${row.user_id}> ${status} - ${row.guesses_count} guesses (${row.score}km)\n`;
          });
        }

        summaryMsg += `\n🎮 Ready for today's challenge?`;

        // Create Play button that launches the Discord Activity
        const playButton = new ButtonBuilder()
          .setLabel("Play Today's Challenge")
          .setStyle(ButtonStyle.Primary)
          .setCustomId("play_locodle")
          .setEmoji("🌍");

        const row = new ActionRowBuilder().addComponents(playButton);

        await channel.send({ content: summaryMsg, components: [row] });
        console.log(
          `✅ Daily summary posted to ${channelRow.guild_name} (${channelRow.channel_id})`
        );
      } catch (channelError) {
        console.error(
          `❌ Failed to post daily summary to channel ${channelRow.channel_id} (${channelRow.guild_name}):`,
          channelError.message
        );
        if (channelError.code === 50001) {
          console.error(`Missing Access for channel ${channelRow.channel_id}.`);
        } else if (channelError.code === 50013) {
          console.error(
            `Missing Permissions for channel ${channelRow.channel_id}.`
          );
        }
      }
    }
  } catch (error) {
    console.error("Failed to post daily summaries:", error);
  }
}

// Post or update a completion message for a channel when a user finishes
export async function postOrUpdateCompletionMessage(
  channelId,
  guildId,
  userId,
  username,
  guessCount,
  won,
  date
) {
  if (!client || !client.isReady()) {
    console.log("Cannot post completion message: bot not ready");
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      console.log(`Channel ${channelId} not found or not text-based`);
      return;
    }

    // Update server streak (increments if this is the first completion today)
    const currentStreak = await updateServerStreak(guildId, date);

    // Get all completions for this guild/date
    const completionsResult = await pool.query(
      `SELECT u.id as user_id, u.username, r.guesses_count, r.won, r.game_mode
       FROM daily_results r
       JOIN discord_users u ON r.user_id = u.id
       WHERE r.date = $1 AND r.guild_id = $2
       ORDER BY r.guesses_count ASC`,
      [date, guildId]
    );

    if (completionsResult.rows.length === 0) {
      return; // No completions yet
    }

    // Build the message content
    let messageContent = `🌍 **Today's Locodle Results** (${date})\n`;

    // Add streak if it exists
    if (currentStreak > 0) {
      messageContent += `🔥 **Server Streak: ${currentStreak} days** 🔥\n`;
    }

    messageContent += `\n`;

    completionsResult.rows.forEach((row, index) => {
      const emoji = row.won ? "✅" : "❌";
      const medal =
        index === 0 ? "🥇 " : index === 1 ? "🥈 " : index === 2 ? "🥉 " : "";
      const modeIndicator = row.game_mode === "easy" ? " (Easy)" : "";
      messageContent += `${medal}<@${row.user_id}> ${emoji} ${
        row.guesses_count
      } guess${row.guesses_count !== 1 ? "es" : ""} ${modeIndicator}\n`;
    });

    // Check if we already have a message for this channel/date
    const existingMessage = await pool.query(
      `SELECT message_id FROM discord_completion_messages WHERE channel_id = $1 AND date = $2`,
      [channelId, date]
    );

    if (existingMessage.rows.length > 0) {
      // Edit existing message
      try {
        const message = await channel.messages.fetch(
          existingMessage.rows[0].message_id
        );
        const playButton = new ButtonBuilder()
          .setLabel("Play Today's Challenge")
          .setStyle(ButtonStyle.Primary)
          .setCustomId("play_locodle")
          .setEmoji("🌍");
        const row = new ActionRowBuilder().addComponents(playButton);

        await message.edit({
          content: messageContent,
          components: [row],
        });

        // Update timestamp
        await pool.query(
          `UPDATE discord_completion_messages SET updated_at = CURRENT_TIMESTAMP WHERE channel_id = $1 AND date = $2`,
          [channelId, date]
        );
      } catch (editError) {
        console.error(
          "Failed to edit message, sending new one:",
          editError.message
        );
        const playButton = new ButtonBuilder()
          .setLabel("Play Today's Challenge")
          .setStyle(ButtonStyle.Primary)
          .setCustomId("play_locodle")
          .setEmoji("🌍");
        const row = new ActionRowBuilder().addComponents(playButton);

        // Message might have been deleted, send a new one
        const newMessage = await channel.send({
          content: messageContent,
          components: [row],
        });
        await pool.query(
          `UPDATE discord_completion_messages SET message_id = $1, updated_at = CURRENT_TIMESTAMP WHERE channel_id = $2 AND date = $3`,
          [newMessage.id, channelId, date]
        );
      }
    } else {
      const playButton = new ButtonBuilder()
        .setLabel("Play Today's Challenge")
        .setStyle(ButtonStyle.Primary)
        .setCustomId("play_locodle")
        .setEmoji("🌍");
      const row = new ActionRowBuilder().addComponents(playButton);

      // Send new message
      const newMessage = await channel.send({
        content: messageContent,
        components: [row],
      });

      // Store message ID
      await pool.query(
        `INSERT INTO discord_completion_messages (channel_id, guild_id, date, message_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (channel_id, date) DO UPDATE SET message_id = $4, updated_at = CURRENT_TIMESTAMP`,
        [channelId, guildId, date, newMessage.id]
      );
    }

    console.log(
      `✅ Completion message posted/updated for channel ${channelId}`
    );
  } catch (error) {
    console.error(
      `Failed to post completion message to channel ${channelId}:`,
      error
    );
  }
}

// Get all registered channels for a guild
export async function getRegisteredChannelsForGuild(guildId) {
  try {
    const result = await pool.query(
      `SELECT channel_id FROM discord_channels WHERE guild_id = $1 AND is_active = true`,
      [guildId]
    );
    return result.rows.map((row) => row.channel_id);
  } catch (error) {
    console.error("Failed to get registered channels:", error);
    return [];
  }
}

// Post a custom result message to a Discord channel
export async function postResultMessage(channelId, content) {
  if (!client || !client.isReady()) {
    console.error("Cannot post message: bot not ready");
    return false;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      console.error(`Channel ${channelId} not found or not text-based`);
      return false;
    }

    const playButton = new ButtonBuilder()
      .setLabel("Play Today's Challenge")
      .setStyle(ButtonStyle.Primary)
      .setCustomId("play_locodle")
      .setEmoji("🌍");

    const row = new ActionRowBuilder().addComponents(playButton);

    await channel.send({
      content: content,
      components: [row],
    });
    console.log(
      `✅ Result message successfully posted to channel ${channelId}`
    );
    return true;
  } catch (error) {
    console.error(
      `❌ Failed to post message to channel ${channelId}:`,
      error.message
    );
    if (error.code === 50001) {
      console.error(
        `Missing Access for channel ${channelId}. The bot might not be in the server or lacks permissions.`
      );
    } else if (error.code === 50013) {
      console.error(
        `Missing Permissions for channel ${channelId}. The bot lacks Send Messages permission.`
      );
    }
    return false;
  }
}

// Export for manual testing
export { postDailySummaryToAllChannels };
