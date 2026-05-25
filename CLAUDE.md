# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

### Prerequisites
- Node.js 18+, npm, Docker, and Docker Compose

### Development Commands

**Start PostgreSQL database (required first):**
```bash
docker-compose up -d
```

**Initialize database (first time only):**
```bash
cd backend && npm run init-db
```

**Backend development:**
```bash
cd backend
npm install
npm run dev
# Runs on http://localhost:3001 with watch mode
```

**Frontend development:**
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

**Linting:**
```bash
cd backend && npm run lint    # ESLint
cd frontend && npm run lint   # ESLint + React hooks
```

**Building for production:**
```bash
cd backend && npm run start
cd frontend && npm run build  # Output in frontend/dist/
```

### Database Scripts

```bash
# Check location data integrity
node backend/scripts/check-locations.js

# Clear today's location (for testing)
node backend/scripts/clear-today-location.js

# Connect to PostgreSQL directly
docker exec -it locodle-postgres psql -U locodle -d locodle

# Reset database (delete all data)
docker-compose down -v && docker-compose up -d && npm run init-db
```

## Architecture Overview

### Full-Stack Geo-Guessing Game

Locodle is a location guessing game where users have 6 attempts to identify world landmarks/locations. The game provides distance feedback with each guess.

### Tech Stack

- **Frontend**: React 18 + Vite + TailwindCSS + Leaflet (maps) + Discord Embedded App SDK
- **Backend**: Fastify + PostgreSQL + Discord.js + Node-cron
- **Database**: PostgreSQL with Docker Compose
- **Build**: ES Modules throughout (no CommonJS)

### Core Data Flow

1. **Daily Challenge Generation** (`backend/services/locationGenerator.js`):
   - Each day, a random location is selected from the locations pool
   - Never repeats within 30 days
   - Stored in `today_location` table
   - Hints are auto-generated based on location type (city/landmark/natural)

2. **Game Session** (`frontend/src/App.jsx` → Backend API):
   - User fetches daily challenge via `GET /api/daily-challenge`
   - User submits guesses via `POST /api/guess` with coordinates
   - Backend calculates distance, returns feedback (km/miles)
   - Win condition: within 50km of target location
   - Game state tracked in `game_sessions` table

3. **Discord Integration**:
   - Discord Activity: Embedded SDK runs the full game inside Discord
   - Discord Bot: Posts daily challenges to channels (node-cron scheduler)
   - User authentication optional (guest mode + Discord OAuth)

### Backend Structure

```
backend/
├── server.js                 # Fastify app, CORS config, route registration
├── db/
│   ├── connection.js        # PostgreSQL pool configuration
│   └── init.sql             # Schema: locations, game_sessions, today_location
├── routes/
│   ├── challenge.js         # GET /api/daily-challenge, POST /api/guess
│   ├── user.js              # User stats, history per game date
│   ├── discord.js           # Discord OAuth/Activity routes
│   ├── analytics.js         # Event tracking (Google Analytics)
│   ├── health.js            # Health check
│   └── tiles.js             # Map tile serving (Leaflet)
├── services/
│   ├── discordBot.js        # Discord bot initialization, cron scheduler
│   └── locationGenerator.js # Daily location selection logic, LOCATION_TEMPLATES
├── utils/
│   ├── calculations.js      # Distance/difficulty calculations
│   ├── geocoding.js         # Location name → coordinates lookup
│   ├── locationUtils.js     # Location validation
│   ├── locationTemplates.js # Location pool definitions
│   └── discordUtils.js      # Discord message formatting
├── scripts/
│   ├── init-db.js
│   ├── check-locations.js
│   └── clear-today-location.js
└── data/
    └── locations.js         # Backup location data (seed data)
```

### Frontend Structure

```
frontend/src/
├── App.jsx                  # Main game container, state management, date picker
├── components/
│   ├── GameMap.jsx          # Leaflet map, click-to-guess, visual feedback
│   ├── GuessInput.jsx       # Search input, location suggestions (geocoding)
│   ├── GuessInputOverlay.jsx # Overlay wrapper for guess input
│   ├── GuessHistory.jsx     # List of guesses with distances
│   ├── GuessHistoryOverlay.jsx
│   ├── GameStats.jsx        # Win/loss, guesses remaining
│   ├── HintsPanel.jsx       # Location hints display
│   ├── GameOverModal.jsx    # Win/loss screen, replay button
│   ├── UserStatsModal.jsx   # Stats across all game dates
│   └── DiscordActivityWrapper.jsx # Discord Embedded App SDK integration
├── contexts/
│   └── DiscordContext.jsx   # useDiscord hook, auth, event tracking
├── utils/
│   ├── apiUtils.js          # API_BASE_URL, fetch helpers
│   ├── gameUtils.js         # Game logic (win condition, difficulty)
│   ├── distanceUtils.js     # km/mi conversion, formatting
│   ├── mapUtils.js          # Map/marker utilities
│   ├── dateUtils.js         # Eastern timezone date handling
│   └── discordUtils.js      # Avatar URLs, Discord API calls
└── main.jsx, index.css
```

### Database Schema

**locations** table:
- `id`, `name`, `lat`, `lng`, `country`, `hints` (JSONB), `is_active`, `created_at`
- Unique constraint: (name, country)

**game_sessions** table:
- `id`, `session_id`, `location_id`, `guesses` (JSONB array), `completed`, `won`, `game_date`, `created_at`, `updated_at`
- Tracks one game session per user per day

**today_location** table (created during init):
- Stores the current day's challenge and metadata

## Key Implementation Details

### Game Modes
- **Hard mode** (default): Standard 6 guesses, no hints
- **Easy mode**: All hints shown upfront, additional guesses tracked separately

### Distance Calculations
- Great Circle Distance (haversine formula) in `backend/utils/calculations.js`
- Frontend converts to km or miles based on user preference (localStorage)

### Discord Integration Setup
For full features, configure in `backend/.env`:
- `DISCORD_CLIENT_ID`: Discord app client ID
- `DISCORD_CLIENT_SECRET`: OAuth secret
- `DISCORD_BOT_TOKEN`: Bot token for automated daily posts
- `FRONTEND_URL`: Frontend URL for CORS fallback

The same `DISCORD_CLIENT_ID` must be hardcoded in `frontend/src/components/DiscordActivityWrapper.jsx`.

### Location Templates
Add new locations in `backend/utils/locationTemplates.js`. Each entry:
```javascript
{
  type: 'city|landmark|natural',
  name: 'Location Name',
  lat: 12.3456,
  lng: 78.9012,
  country: 'Country'
}
```
Hints are auto-generated from type, hemisphere, and continent.

### Rate Limiting
Backend configured with 80 requests per 60 seconds. Adjust in `server.js` if needed.

### Frontend-Backend Communication
- In Discord Activity mode: relative URLs (SDK handles base)
- In web mode: full URLs with `API_BASE_URL` (localhost:3001 dev, production URL in prod)
- Both modes use the same `customFetch` wrapper in `App.jsx`

## Common Development Tasks

**Adding a new location:**
1. Add entry to `backend/utils/locationTemplates.js`
2. Run `node backend/scripts/check-locations.js` to validate
3. Restart backend (pick new location on next day or run `clear-today-location.js`)

**Testing the Discord bot locally:**
1. Set `DISCORD_BOT_TOKEN` in `.env`
2. Invite bot to test server
3. Bot posts daily challenge at configured cron time (editable in `discordBot.js`)

**Debugging game state:**
- Check `game_sessions` table for session data
- Frontend logs game state to console (gameUtils.js)
- Network tab shows API responses (distance, hints, session ID)

**Changing difficulty/hints behavior:**
- Game mode logic in `App.jsx` (lines 31-34)
- Difficulty calculations in `backend/utils/calculations.js`

## Notes

- All code uses ES Modules (import/export), no CommonJS
- Fastify logger is enabled by default—check terminal output for detailed logs
- Frontend uses React hooks and context (no Redux)
- Map tiles loaded from OpenStreetMap (Leaflet default)
- Discord Activity SDK requires origin whitelisting in Discord dev portal
- User sessions stored in browser localStorage; game state in PostgreSQL
- Easy mode guess tracking is separate from standard guess count (feature added in recent commits)
