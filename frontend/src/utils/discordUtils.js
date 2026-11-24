export const DISCORD_CLIENT_ID = "1442219897131368508";

// What the bot needs in a channel: View Channel (1 << 10) and
// Send Messages (1 << 11). It only deletes its own messages, which needs
// no extra permission.
const BOT_PERMISSIONS = (1 << 10) | (1 << 11);

// Discord's "add app to server" page. guildId preselects a server.
export function getBotInviteUrl(guildId) {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    scope: "bot applications.commands",
    permissions: String(BOT_PERMISSIONS),
    integration_type: "0",
  });
  if (guildId) params.set("guild_id", guildId);
  return `https://discord.com/oauth2/authorize?${params}`;
}

export function getDiscordAvatarUrl(user) {
  if (!user) return null;

  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
  }

  return `https://cdn.discordapp.com/embed/avatars/${
    parseInt(user.id || "0") % 5
  }.png`;
}

export function getDiscordAuthUrl(clientId, redirectUri) {
  const encodedRedirectUri = encodeURIComponent(
    redirectUri.replace(/\/+$/, "")
  );
  const scope = encodeURIComponent("identify guilds");
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodedRedirectUri}&response_type=code&scope=${scope}`;
}
