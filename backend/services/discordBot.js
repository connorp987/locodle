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
      // Removed MessageContent/GuildMessages to avoid "Disallowed Intents" error
      // We will use Slash Commands instead, which don't require these privileged intents
    ],
  });

  client.once(Events.ClientReady, async (c) => {
    console.log(`🤖 Discord Bot ready! Logged in as ${c.user.tag}`);

    // Register Slash Command
    const data = [
      {
        name: "leaderboard",
        description: "Show today's Locodle leaderboard",
      },
    ];

    try {
      await c.application.commands.set(data);
      console.log("✅ Slash Commands registered");
    } catch (error) {
      console.error("❌ Failed to register commands:", error);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "leaderboard") {
      // Placeholder for leaderboard logic
      await interaction.reply("🏆 **Leaderboard**\nNo results yet for today! Be the first to play.");
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
