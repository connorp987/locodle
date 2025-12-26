import {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import cron from "node-cron";
import pool from "../db/connection.js";
import { getLocationForDate } from "./locationGenerator.js";

let client = null;

// Time to post daily summary (default: 9:30 AM Eastern)
const SUMMARY_HOUR = process.env.DISCORD_SUMMARY_HOUR || "9";
const SUMMARY_MINUTE = process.env.DISCORD_SUMMARY_MINUTE || "30";

export const initDiscordBot = async () => {
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
    console.log(`🤖 Discord Bot ready! Logged in as ${c.user.tag}`);

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
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    // /join command - register this channel for daily summaries
    if (interaction.commandName === "join") {
      try {
        await interaction.deferReply();

        const guildName = interaction.guild?.name || "Unknown Server";
        const channelName = interaction.channel?.name || "Unknown Channel";

        // Insert or update channel registration
        await pool.query(
          `INSERT INTO discord_channels (channel_id, guild_id, guild_name, channel_name, is_active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (channel_id) DO UPDATE SET is_active = true, guild_name = $3, channel_name = $4`,
          [channelId, guildId, guildName, channelName]
        );

        const playButton = new ButtonBuilder()
          .setLabel("Play Today's Challenge")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/activities/1442219897131368508`)
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
        await interaction.deferReply();

        const today = new Date().toISOString().split("T")[0];

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

        await interaction.editReply(leaderboardMsg);
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
    console.error("Failed to post result:", error);
  }
};

// Post summary to a single channel (used for testing and individual posts)
async function postSummaryToChannel(channelId, guildId) {
  if (!client || !client.isReady()) {
    console.log("Cannot post summary: bot not ready");
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      console.log(`Channel ${channelId} not found or not text-based`);
      return;
    }

    // Get yesterday's date in Eastern Time (so we don't spoil today's challenge)
    const now = new Date();
    const easternNow = new Date(
      now.toLocaleString("en-US", { timeZone: "America/New_York" })
    );
    easternNow.setDate(easternNow.getDate() - 1);
    const yesterdayStr = easternNow.toISOString().split("T")[0];

    // Get yesterday's location using the same function as the main app
    const location = await getLocationForDate(yesterdayStr);
    const locationName = location
      ? `${location.name}, ${location.country}`
      : "Unknown Location";

    // Get results for this guild only (include user_id for mentions)
    const result = await pool.query(
      `SELECT u.id as user_id, u.username, r.score, r.guesses_count, r.won
       FROM daily_results r
       JOIN discord_users u ON r.user_id = u.id
       WHERE r.date = $1 AND r.guild_id = $2
       ORDER BY r.won DESC, r.guesses_count ASC, r.score ASC`,
      [yesterdayStr, guildId]
    );

    let summaryMsg = `📊 **Yesterday's Results (${yesterdayStr})**\n`;
    summaryMsg += `📍 Location: **${locationName}**\n\n`;

    if (result.rows.length === 0) {
      summaryMsg += `No one from this server played yesterday! 😢`;
    } else {
      // @mention all players who participated
      const mentions = result.rows.map((r) => `<@${r.user_id}>`).join(" ");
      summaryMsg += `${mentions}\n\n`;

      summaryMsg += `👥 ${result.rows.length} player${
        result.rows.length > 1 ? "s" : ""
      } participated\n\n`;

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
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/activities/1442219897131368508`)
      .setEmoji("🌍");

    const row = new ActionRowBuilder().addComponents(playButton);

    await channel.send({ content: summaryMsg, components: [row] });
  } catch (error) {
    console.error(`Failed to post summary to channel ${channelId}:`, error);
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
    const easternNow = new Date(
      now.toLocaleString("en-US", { timeZone: "America/New_York" })
    );
    easternNow.setDate(easternNow.getDate() - 1);
    const yesterdayStr = easternNow.toISOString().split("T")[0];

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

        let summaryMsg = `📊 **Yesterday's Results (${yesterdayStr})**\n`;
        summaryMsg += `📍 Location: **${locationName}**\n\n`;

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
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/activities/1442219897131368508`)
          .setEmoji("🌍");

        const row = new ActionRowBuilder().addComponents(playButton);

        await channel.send({ content: summaryMsg, components: [row] });
        console.log(
          `✅ Daily summary posted to ${channelRow.guild_name} (${channelRow.channel_id})`
        );
      } catch (channelError) {
        console.error(
          `Failed to post to channel ${channelRow.channel_id}:`,
          channelError.message
        );
      }
    }
  } catch (error) {
    console.error("Failed to post daily summaries:", error);
  }
}

// Export for manual testing
export { postDailySummaryToAllChannels };
