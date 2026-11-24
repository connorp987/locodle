// Minimal fake of the Discord REST API for local testing.
// Run with DISCORD_API_BASE=http://localhost:4555 DISCORD_BOT_TOKEN=test-bot-token.
// GET /__log returns every write the bot made.
import http from "node:http";

const BOT = "Bot test-bot-token";
const users = { "good-token": "700000000000000001", "other-token": "700000000000000099" };
const channels = {
  "800000000000000000": { guild_id: "900000000000000001" },
  "811111111111111111": { type: 1 }, // a DM: no guild
};
const guilds = { "900000000000000001": { name: "Mock Guild", members: ["700000000000000001"] } };
const log = [];
let nextId = 5000;

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw && req.headers["content-type"]?.includes("json") ? JSON.parse(raw) : raw;
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    const auth = req.headers.authorization;
    let m;

    if (p === "/__log") return send(res, 200, log);

    if (p === "/oauth2/token" && req.method === "POST") {
      const form = new URLSearchParams(raw);
      log.push({ op: "oauth", params: Object.fromEntries(form) });
      return form.get("code") === "good-code"
        ? send(res, 200, { access_token: "good-token", token_type: "Bearer" })
        : send(res, 400, { error: "invalid_grant" });
    }
    if (p === "/users/@me") {
      const id = users[auth?.replace("Bearer ", "")];
      return id ? send(res, 200, { id, username: "mockplayer", avatar: "abc" }) : send(res, 401, { code: 0, message: "401: Unauthorized" });
    }

    // Everything else needs the bot token, except interaction webhooks
    if (!p.startsWith("/webhooks/") && auth !== BOT) return send(res, 401, { code: 0, message: "401: Unauthorized" });

    if ((m = p.match(/^\/channels\/(\d+)$/))) {
      const c = channels[m[1]];
      return c ? send(res, 200, { id: m[1], ...c }) : send(res, 404, { code: 10003, message: "Unknown Channel" });
    }
    if ((m = p.match(/^\/guilds\/(\d+)\/members\/(\d+)$/))) {
      return guilds[m[1]]?.members.includes(m[2])
        ? send(res, 200, { user: { id: m[2] } })
        : send(res, 404, { code: 10007, message: "Unknown Member" });
    }
    if ((m = p.match(/^\/guilds\/(\d+)$/))) {
      const g = guilds[m[1]];
      return g ? send(res, 200, { id: m[1], name: g.name }) : send(res, 404, { code: 10004, message: "Unknown Guild" });
    }
    if ((m = p.match(/^\/channels\/(\d+)\/messages$/)) && req.method === "POST") {
      const id = String(nextId++);
      log.push({ op: "send", channel: m[1], id, body });
      return send(res, 200, { id, channel_id: m[1] });
    }
    if ((m = p.match(/^\/channels\/(\d+)\/messages\/(\d+)$/)) && req.method === "DELETE") {
      log.push({ op: "delete", channel: m[1], message: m[2] });
      return send(res, 204);
    }
    if ((m = p.match(/^\/webhooks\/(\d+)\/([^/]+)\/messages\/@original$/)) && req.method === "PATCH") {
      log.push({ op: "edit_original", app: m[1], token: m[2], body });
      return send(res, 200, { id: "1" });
    }
    if (p === "/applications/@me") return send(res, 200, { id: "1442219897131368508" });
    if ((m = p.match(/^\/applications\/(\d+)\/commands$/))) {
      if (req.method === "POST") {
        log.push({ op: "register_command", body });
        return send(res, 201, body);
      }
      return send(res, 200, [{ name: "leaderboard" }]);
    }
    send(res, 404, { code: 0, message: `mock: no route for ${req.method} ${p}` });
  })
  .listen(4555, () => console.log("mock Discord on http://localhost:4555"));
