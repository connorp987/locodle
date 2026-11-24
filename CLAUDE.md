# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repository.

## Overview

Locodle is a daily geography guessing game (web + Discord Activity) with a Discord bot. As of Nov 2026 the backend is **Rust (`backend-rs/`)**. One binary serves the API *and* the built frontend, runs the daily jobs and handles the bot. It deploys as a single Railway service from the root `Dockerfile`.

- `backend-rs/`: the backend. See `backend-rs/README.md` for env vars and test tooling.
- `frontend/`: React 18 + Vite + Tailwind + Leaflet + Discord Embedded App SDK.
- `backend/`: the **old Node/Fastify backend, reference only**. Nothing deploys from it; don't add features there.

## Commands

```bash
# Backend (from backend-rs/)
cargo run                      # API on :3001 (PORT); serves ./public or STATIC_DIR if present
cargo run -- migrate           # apply migrations/ (idempotent; same as the Railway pre-deploy)
cargo test                     # unit tests
cargo clippy                   # keep at zero warnings

# Frontend (from frontend/)
npm run dev                    # :3000, calls the API at http://localhost:3001
npm run build                  # dist/
npm run lint                   # must pass with --max-warnings 0

# Full production image (repo root)
docker build -t locodle .
docker run -p 3001:3001 -e DATABASE_URL=... locodle
```

### Local database

`docker-compose up -d` starts Postgres on 5432. **On this Windows machine a native Postgres service already holds 5432**, so the compose container can't be reached there. Use a separate container on 5433:

```bash
docker run -d --name locodle-pg-rs -e POSTGRES_USER=locodle -e POSTGRES_PASSWORD=locodle_dev_password \
  -e POSTGRES_DB=locodle -p 5433:5432 postgres:16-alpine
DATABASE_URL=postgresql://locodle:locodle_dev_password@localhost:5433/locodle cargo run -- migrate
```

### Never run locally with the real bot token

`backend/.env` holds the real `DISCORD_BOT_TOKEN`. A local server with that token would register commands, connect to the gateway and **post the 9:30 ET daily summary to real channels**. Blank it (`DISCORD_BOT_TOKEN=`) or use the mocks below. Empty env values count as unset.

## Backend layout (`backend-rs/src/`)

| File | Responsibility |
| --- | --- |
| `main.rs` | startup, `migrate` subcommand, background jobs, graceful shutdown |
| `config.rs` | env vars (`config::var` treats empty as unset) |
| `db.rs` | sqlx pool (max 5 connections, sslmode prefer) and embedded migrations |
| `locations.rs` | daily location: date cache, generation, `/api/days` query |
| `hints.rs` | location templates (`data/location_templates.json`, parsed on demand) and hint/continent generation |
| `geocode.rs` | reverse geocoding (Nominatim, then BigDataCloud) with a 500-entry cache that shares in-flight lookups |
| `calc.rs` | haversine distance, rhumb bearing, cardinal direction |
| `discord.rs` | Discord REST client, completion/summary messages, server streaks, slash command handlers |
| `gateway.rs` | gateway connection **for online presence only** (intents 0, no cache) |
| `scheduler.rs` | daily jobs at fixed Eastern times (00:15 location pre-generation, 9:30 summary) |
| `rate_limit.rs` | 80 req/60s per client IP (`X-Real-IP`, else last `X-Forwarded-For` hop) |
| `static_files.rs` | serves the frontend (see "Static serving") |
| `routes/` | `challenge.rs` (daily-challenge, guess, geocode), `user.rs` (stats, guesses), `discord.rs` (token, post-result-message, interactions), `misc.rs` (health, days, analytics, tiles) |

### API

| Route | Notes |
| --- | --- |
| `GET /api/health`, `GET /health` | health checks |
| `GET /api/days` | all challenge dates (`YYYY-MM-DD`) |
| `GET /api/daily-challenge?date=` | hints for a date (default: today, Eastern). Today's location is generated on first request |
| `POST /api/guess` | scores a guess. With `discord_user_id` it also saves to `user_guesses`/`daily_results` and posts completion messages |
| `GET /api/geocode?lat=&lng=` | place name for a map click (the guess response returns `pendingName: true`) |
| `GET /api/user/{id}/stats`, `GET /api/user/{id}/guesses/{date}` | player stats and history |
| `POST /api/token` | Discord OAuth code exchange |
| `POST /api/post-result-message` | activity "share" button. **Requires the player's `access_token`**; posts only if they're a member of the channel's server |
| `POST /api/interactions` | Discord HTTP interactions (Ed25519-verified with `DISCORD_PUBLIC_KEY`) |
| `POST /api/analytics` | GA4 proxy for the activity |
| `GET /api/tiles/{z}/{x}/{y}` | map tile proxy for the activity (Discord's CSP blocks tile hosts) |

Unknown `/api/*` paths return a JSON 404. Rate limiting skips tiles and interactions.

### Response formats the frontend depends on

These match what the old Node backend returned, so keep them unless you change the frontend too:
- `recentGames[].date` is `"YYYY-MM-DDT00:00:00.000Z"`, as node-postgres serialized DATE on a UTC server.
- In `/api/user/{id}/guesses/{date}`, `lat`, `lng` and `score` are **strings** (NUMERIC columns, selected with `::text`).
- Guess responses omit `guess` when the request had no name (JS dropped `undefined` keys).

### Static serving (replaced Caddy)

- `/assets/*` (hashed filenames): `Cache-Control: public, max-age=31536000, immutable`. Everything else: `no-cache`, revalidated with Last-Modified.
- Precompressed `.br`/`.gz` files (made in the Dockerfile) are served when present; otherwise responses are compressed on the fly.
- SPA fallback to `index.html` **only for paths without an extension**, so a missing `/llms.txt` is a real 404.
- `X-Content-Type-Options: nosniff` on every response.

## Database

The schema lives in `backend-rs/migrations/` (byte-identical copies of `backend/db/init.sql` and `backend/db/migrations/*`). Every script is idempotent and **runs on every deploy** (pre-deploy `/app/locodle-server migrate`). A failure in `001_init.sql` is fatal; later failures are logged and skipped.

Tables: `locations` (daily challenges, `UNIQUE(name, country)`, partial unique index on `game_date WHERE is_daily_challenge`), `discord_users`, `user_guesses`, `daily_results` (`UNIQUE(user_id, date)`), `discord_channels`, `discord_completion_messages`, `server_streaks`, and `game_sessions` (unused).

- Migrations 005 and 007 re-date soft-deleted duplicate `locations` rows (`is_active = false`) on every run. This is longstanding and harmless (the rows stay hidden). Don't be surprised by it in fingerprint diffs.
- Location generation excludes every `(name, country)` already in `locations`, since the unique constraint forbids reuse. The Node version only excluded the last 30 days, so it could pick a used name and 500.
- **The template pool (470) runs out around April 2027.** Add entries to `backend-rs/data/location_templates.json` (`type` is `city`/`landmark`/`natural`).

## Discord

- **Commands and buttons arrive over HTTP** at `/api/interactions`: `/join`, `/leave` and `/leaderboard` are deferred (type 5) and then the reply is edited; the `play_locodle` button responds with LAUNCH_ACTIVITY (type 12). With an Interactions Endpoint URL set, Discord sends nothing over the gateway.
- **Posting** (completion messages, daily summary, shares) is plain REST with the bot token. Commands are registered at startup if missing.
- **Gateway**: `gateway.rs` keeps one connection with intents 0 only so the bot shows online ("Playing Locodle"). It resumes and reconnects, and stops on fatal closes (4004 bad token, 4010–4014).
- **Activity networking**: in Discord the frontend uses relative URLs proxied by Discord. URL Mappings must be **only `/` → `locodle.com`**. A leftover `/api` → `api.locodle.com` mapping caused "No access token provided" on launch.
- **Bot invite**: `getBotInviteUrl()` in `frontend/src/utils/discordUtils.js` (permissions 3072 = View Channel + Send Messages). `DISCORD_CLIENT_ID` is defined once there.
- Inside the activity, external links must go through `openExternalLink` from `useDiscord()` (SDK `openExternalLink`), not `window.open`.

## Frontend notes

- `API_BASE_URL` (`src/utils/apiUtils.js`): `VITE_API_URL` if set, otherwise `http://localhost:3001` in dev and `""` (same origin) in production builds. Don't reintroduce a cross-origin default.
- `formatDate` in `src/utils/dateUtils.js` parses the date part as a local calendar date. Parsing `YYYY-MM-DD` with `new Date()` showed the previous day for US players.
- The editor's "await has no effect" warning at `App.jsx` `handleShareAndExit` is harmless: the context default for `closeActivity` isn't async.
- `package-lock.json` is gitignored, so Railway resolves dependency versions fresh on each build.

## Testing tools

All in `backend-rs/scripts/`:
- `parity.mjs`: same requests to two backends, diffs the JSON. Used to verify the Rust port against Node; run Node with `TZ=UTC` to match Railway.
- `history-parity.mjs`: read-only check that every challenge day is listed, loads and is winnable, and that every player's stats and history match between two backends.
- `mock-discord.mjs`: fake Discord REST API on :4555. Records posts at `GET /__log`. Run the server with `DISCORD_API_BASE=http://localhost:4555 DISCORD_BOT_TOKEN=test-bot-token`. `DISCORD_GATEWAY_URL` likewise points the presence connection at a fake gateway.

Verified Nov 2026:
- Node and Rust returned identical responses across all endpoints, and on 121 days of seeded history (2,231 responses).
- `migrate` and `npm run init-db` produce identical databases.
- Playing and reading every past day leaves the data byte-identical.
- The Discord flows passed 29 checks against the mock; the gateway client passed 11 scenario checks.

## Deployment (Railway)

- Project `locodle`. Service `dependable-rebirth` (domain `locodle.com`) builds the root `Dockerfile`. Pre-deploy: `/app/locodle-server migrate`. Healthcheck: `/api/health`.
- The runtime image is `gcr.io/distroless/cc-debian12:debug-nonroot`. The debug variant adds a ~1 MB busybox shell so Railway commands work whether or not Railway shell-wraps them. `MALLOC_ARENA_MAX=2` keeps glibc memory low.
- Memory: about 4 MiB idle and ~17 MiB under load, versus ~180 MB for the old Node + Caddy services.
- The Railway CLI is logged in on this machine. Read logs without linking: `railway logs -p 78335f90-d826-4822-81c4-3f19af75f99a -e production -s dependable-rebirth -n 100`.
- Cleanup still pending: delete the old `locodle-second` (Node) service and the `api.locodle.com` DNS record.

## Backlog / ideas

- Serve Discord-mode map tiles through Discord URL mappings instead of the `/api/tiles` proxy.
- Add more location templates before the pool runs out.
- Remove `backend/` once the old Railway service is deleted. Its scripts `check-locations.js` and `clear-today-location.js` still work against the DB.

## Conventions

- Rust: edition 2024, no `unsafe`, `cargo clippy` clean. Queries are runtime `sqlx::query` with string literals (no compile-time DB needed). Bind dates as text and cast with `$1::date`; cast NUMERIC to `::float8`/`::text` in SQL.
- Frontend: ES modules, React hooks and context (no Redux), Tailwind.
