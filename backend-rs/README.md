# locodle-server (Rust)

Rust replacement for `backend/` (Fastify + discord.js). One binary serves the
API and the built frontend (replacing the Caddy service), runs the daily jobs,
and handles the Discord bot over REST + HTTP interactions instead of a
gateway connection.

Stack: axum, tokio, sqlx (Postgres), reqwest (rustls/ring).

## Run locally

```bash
cd backend-rs
DATABASE_URL=postgresql://locodle:locodle_dev_password@localhost:5432/locodle cargo run
# API on http://localhost:3001; also serves ../frontend/dist when STATIC_DIR points at it
```

Apply the schema (same scripts as the old `npm run init-db`, all idempotent):

```bash
cargo run -- migrate
```

Full image (frontend + backend), as deployed:

```bash
docker build -t locodle .            # from the repo root
docker run -p 3001:3001 -e DATABASE_URL=... locodle
```

## Railway

- Builder: Dockerfile at the repo root.
- Pre-deploy command: `/app/locodle-server migrate` (replaces `npm run init-db`;
  runs the same SQL files, byte-for-byte).

## Environment

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres URL. TLS is used when the server offers it (no cert verification, like before). |
| `PORT` | Default 3001. |
| `STATIC_DIR` | Frontend build to serve. The image sets `/app/public`. |
| `RUN_MIGRATIONS` | `true` to apply the schema on startup. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | OAuth token exchange (`/api/token`). |
| `DISCORD_BOT_TOKEN` | Enables posting messages, the daily summary, and slash-command registration. |
| `DISCORD_PUBLIC_KEY` | **New.** The application's public key (Developer Portal > General Information). Enables `/api/interactions`. |
| `DISCORD_SUMMARY_HOUR`, `DISCORD_SUMMARY_MINUTE` | Daily summary time, Eastern. Default 9:30. |
| `GA_MEASUREMENT_ID`, `GA_API_SECRET` | Analytics proxy for the Discord activity. |
| `FRONTEND_URL` | Extra allowed CORS origin. |
| `DISCORD_API_BASE` | Testing only: point Discord REST calls at `scripts/mock-discord.mjs`. |
| `RUST_LOG` | Log filter, default `info,sqlx=warn`. |

## Discord: interactions instead of the gateway

Slash commands (`/join`, `/leave`, `/leaderboard`) and the Play button arrive
as signed HTTP requests at `/api/interactions`. To switch over, set
**Interactions Endpoint URL** in the Developer Portal to
`https://<domain>/api/interactions`. Once that's set Discord stops delivering
interactions over the gateway, so the old Node bot must be shut down at the
same time.

## Checking against the Node backend

`scripts/parity.mjs` sends the same requests to both backends (sharing one
database) and diffs the JSON. Run the Node backend with `TZ=UTC` to match
Railway's date serialisation.

```bash
node backend-rs/scripts/parity.mjs http://localhost:3001 http://localhost:3002
```

`scripts/history-parity.mjs` is read-only: it checks that every challenge day
in the database is listed, loads and is winnable, and compares every player's
stats and per-day history between the two backends.

```bash
node backend-rs/scripts/history-parity.mjs http://localhost:3001 http://localhost:3002 \
  "docker exec locodle-pg-rs psql -U locodle -d locodle"
```

## Testing the Discord features locally

`scripts/mock-discord.mjs` fakes the Discord REST API (port 4555) and records
what the bot posts at `GET /__log`. Run the server with
`DISCORD_API_BASE=http://localhost:4555 DISCORD_BOT_TOKEN=test-bot-token`.

## Deliberate differences from the Node backend

- New locations exclude every template already in `locations`. The table's
  UNIQUE (name, country) made reuse impossible, so the old 30-day window could
  pick a used name and fail the insert.
- Rate limiting is per client IP (from Railway's `X-Real-IP` /
  `X-Forwarded-For`); before, every request appeared to come from the proxy.
  Tiles and Discord interactions aren't rate limited.
- `/api/post-result-message` requires the player's Discord `access_token` (the
  activity sends it) and only posts if that player is a member of the
  channel's server. It can't ping @everyone, @here or roles.
- Tile responses use the upstream content type (Esri serves JPEG).
- Unknown `/api/*` paths return a JSON 404; other unknown extensionless paths
  get the SPA's `index.html`.
