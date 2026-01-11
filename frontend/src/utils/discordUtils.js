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
