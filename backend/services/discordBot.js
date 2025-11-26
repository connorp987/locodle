import { Client, GatewayIntentBits, Events } from "discord.js";

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
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`🤖 Discord Bot ready! Logged in as ${c.user.tag}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    if (message.content === "!leaderboard" || message.content === "/leaderboard") {
      // Placeholder for leaderboard logic
      // In a real implementation, we would query the DB here
      message.reply("🏆 **Leaderboard**\nNo results yet for today! Be the first to play.");
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
