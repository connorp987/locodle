import pool from "../db/connection.js";
import { postResultMessage } from "../services/discordBot.js";

export default async function discordRoutes(fastify) {
  fastify.post("/api/token", async (request, reply) => {
    const { code, redirect_uri } = request.body;

    if (!code) {
      return reply.code(400).send({ error: "Missing code" });
    }

    try {
      const tokenParams = {
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
      };

      if (redirect_uri) {
        tokenParams.redirect_uri = redirect_uri.replace(/\/+$/, "");
      }

      const response = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(tokenParams),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(
          "❌ Discord Token Exchange Failed:",
          "Status:",
          response.status,
          "Response:",
          JSON.stringify(data),
          "Sent Params:",
          JSON.stringify({
            ...tokenParams,
            client_secret: "[REDACTED]",
            code: "[REDACTED]",
          })
        );
        fastify.log.error("Discord Token Error:", data);
        return reply.code(500).send({ error: "Failed to exchange token" });
      }

      const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
        },
      });

      if (!userResponse.ok) {
        fastify.log.error("Failed to fetch Discord user profile");
        return reply.code(500).send({ error: "Failed to fetch user profile" });
      }

      const user = await userResponse.json();

      try {
        await pool.query(
          `INSERT INTO discord_users (id, username, avatar) 
           VALUES ($1, $2, $3) 
           ON CONFLICT (id) DO UPDATE SET username = $2, avatar = $3`,
          [user.id, user.username, user.avatar]
        );
      } catch (dbError) {
        console.error("Failed to upsert Discord user:", dbError);
      }

      return { access_token: data.access_token, user };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  fastify.post("/api/post-result-message", async (request, reply) => {
    const { channelId, content } = request.body;

    if (!channelId || !content) {
      return reply.code(400).send({ error: "Missing channelId or content" });
    }

    try {
      const success = await postResultMessage(channelId, content);

      if (success) {
        return reply.send({ status: "sent" });
      } else {
        return reply.code(500).send({ error: "Failed to send message" });
      }
    } catch (error) {
      fastify.log.error(`Post result message error: ${error.message}`);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });
}
