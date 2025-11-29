import { Client, GatewayIntentBits, Events } from "discord.js";
import pool from "../db/connection.js";

let client = null;

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

    // Register Slash Command
    // We use .create() instead of .set() to avoid overwriting the "Entry Point" command
    // which is required for Discord Activities.
    try {
      const commands = await c.application.commands.fetch();
      const hasLeaderboard = commands.some(cmd => cmd.name === "leaderboard");
      
      if (!hasLeaderboard) {
        await c.application.commands.create({
          name: "leaderboard",
          description: "Show today's Locodle leaderboard",
        });
        console.log("✅ Slash Command '/leaderboard' registered");
      } else {
        console.log("✅ Slash Command '/leaderboard' already exists");
      }
    } catch (error) {
      console.error("❌ Failed to register commands:", error);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "leaderboard") {
      try {
        await interaction.deferReply(); // Defer reply to allow time for DB query

        const today = new Date().toISOString().split("T")[0];
        
        // Query top 10 results for today
        // Ordered by: Won (true first), Guesses (low to high), Score/Distance (low to high)
        const result = await pool.query(
          `SELECT u.username, r.score, r.guesses_count, r.won
           FROM daily_results r
           JOIN discord_users u ON r.user_id = u.id
           WHERE r.date = $1
           ORDER BY r.won DESC, r.guesses_count ASC, r.score ASC
           LIMIT 10`,
          [today]
        );

        if (result.rows.length === 0) {
          await interaction.editReply("🏆 **Today's Leaderboard**\nNo results yet! Be the first to play.");
          return;
        }

        let leaderboardMsg = `🏆 **Leaderboard for ${today}**\n\n`;
        
        result.rows.forEach((row, index) => {
          const rank = index + 1;
          const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
          const status = row.won ? "✅" : "❌";
          leaderboardMsg += `${medal} **${row.username}** ${status} - ${row.guesses_count} guesses (${row.score}km)\n`;
        });

        await interaction.editReply(leaderboardMsg);
      } catch (error) {
        console.error("Leaderboard error:", error);
        // Only try to edit reply if we successfully deferred or replied
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("❌ Failed to fetch leaderboard.");
        } else {
          // If we failed before deferring (e.g. Unknown Interaction), we can't do anything
          console.log("Could not reply to interaction (likely timed out or unknown).");
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
