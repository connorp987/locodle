# Locodle 🌍

A daily geography guessing game. Each day there's a new mystery place: guess on the map and get distance and direction hints until you find it. Play on the web at [locodle.com](https://locodle.com) or inside Discord as an Activity, with server leaderboards and streaks.

## Add the bot to your Discord server

https://discord.com/oauth2/authorize?client_id=1442219897131368508&scope=bot+applications.commands&permissions=3072&integration_type=0

Logged-in players can also use the **Add to server** button in the game. Then run `/join` in a channel to get daily results there.

## Features

- 🗺️ Interactive map: click to guess or search by name
- 🎯 A new location every day, plus every past day playable
- 💡 Hard mode (distance only) and Easy mode (hints and direction arrows)
- 📊 Per-player stats, streaks and history for Discord-logged-in players
- 🎮 Discord Activity: play inside Discord, share results to the channel
- 🤖 Discord bot: `/join`, `/leave`, `/leaderboard`, live completion messages, and a 9:30 AM Eastern daily summary

## Tech stack

| Part | Tech |
| --- | --- |
| Frontend | React 18, Vite, TailwindCSS, Leaflet, Discord Embedded App SDK |
| Backend | Rust: axum, tokio, sqlx (Postgres), reqwest (rustls/ring) |
| Discord | HTTP interactions + REST; a minimal gateway connection only for online presence |
| Database | PostgreSQL |
| Hosting | One Railway service built from the root `Dockerfile` |

The Rust server (`backend-rs/`) serves both the API and the built frontend from one container. It idles at about 4 MiB of memory and stays under ~17 MiB under load. The previous setup used about 180 MB across two services: Node/Fastify plus a Caddy server for the frontend.

`backend/` is the old Node backend, kept for reference only. Nothing deploys from it.

## Local development

Prerequisites: Rust (stable), Node.js 18+, Docker.

**1. Database**

```bash
docker-compose up -d
```

If a native Postgres is already using port 5432 (e.g. a Windows Postgres service), run a separate container on another port instead:

```bash
docker run -d --name locodle-pg-rs -e POSTGRES_USER=locodle -e POSTGRES_PASSWORD=locodle_dev_password \
  -e POSTGRES_DB=locodle -p 5433:5432 postgres:16-alpine
```

**2. Backend** (port 3001)

```bash
cd backend-rs
export DATABASE_URL=postgresql://locodle:locodle_dev_password@localhost:5432/locodle
cargo run -- migrate     # create/update the schema (idempotent)
cargo run                # API on http://localhost:3001
```

**3. Frontend** (port 3000, calls the API on :3001)

```bash
cd frontend
npm install
npm run dev
```

⚠️ **Don't run locally with the real `DISCORD_BOT_TOKEN`.** A local server with the token schedules the daily summary and posts it to real channels. To test Discord features, use the mock described in [`backend-rs/README.md`](backend-rs/README.md).

**Production-like run** (one container: frontend and API on :3001):

```bash
docker build -t locodle .
docker run -p 3001:3001 -e DATABASE_URL=... locodle
```

## Deployment (Railway)

One service (`dependable-rebirth`, domain `locodle.com`):

| Setting | Value |
| --- | --- |
| Root directory | repo root |
| Builder | Dockerfile |
| Pre-deploy command | `/app/locodle-server migrate` |
| Healthcheck path | `/api/health` |

Variables: `DATABASE_URL` (reference to the Postgres service), `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `GA_API_SECRET`. The full list is in [`backend-rs/README.md`](backend-rs/README.md).

The pre-deploy step runs the same idempotent SQL scripts on every deploy (`backend-rs/migrations/`).

### Discord developer portal

- **Activities → URL Mappings:** only the root mapping, `/` → `locodle.com`. Don't add an `/api` mapping. API calls must fall through to the root; a leftover `/api` → `api.locodle.com` mapping broke activity login ("No access token provided") after the move to one service.
- **General Information → Interactions Endpoint URL:** `https://locodle.com/api/interactions`. Requires `DISCORD_PUBLIC_KEY` to be set first, since Discord tests the endpoint when you save.
- **Bot:** *Public Bot* on (so others can add it) and *Requires OAuth2 Code Grant* off.

## How the game works

- Each day (Eastern time) a location is picked from `backend-rs/data/location_templates.json` (470 entries). Hints are generated from its type, hemisphere and continent.
- A location is never reused: the table has `UNIQUE (name, country)`. **The pool runs out around April 2027**, so add entries to that JSON file before then.
- A guess within 50 km wins. Score and distance are computed server-side (haversine).
- Guests keep progress in the browser. Discord-logged-in players' guesses and results are stored, which powers stats, leaderboards and streaks.

## Project structure

```
locodle-second/
├── Dockerfile               # frontend build + Rust build -> one small image
├── backend-rs/              # the backend (see backend-rs/README.md)
│   ├── src/                 # axum server, Discord, gateway, scheduler
│   ├── migrations/          # SQL run by `locodle-server migrate`
│   ├── data/location_templates.json
│   └── scripts/             # parity checks and mock Discord (testing)
├── frontend/                # React app
├── backend/                 # old Node backend (reference only)
└── docker-compose.yml       # local Postgres
```
