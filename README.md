# Locodle v2.0 🌍

A modern geo-location guessing game built with React and Fastify. Guess famous landmarks and locations around the world in 6 tries or less! Available as a web app and Discord Activity.

## Features

- 🗺️ Interactive map with guess visualization
- 🎯 Daily challenges with new locations
- 💡 Helpful hints for each location
- 📊 Real-time statistics and guess history
- 🎨 Beautiful, modern UI with TailwindCSS
- 📱 Responsive design
- 🎮 Discord Activity integration - play directly in Discord
- 🤖 Discord bot with automated daily challenges
- 🗄️ PostgreSQL database for persistent data

## Tech Stack

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **TailwindCSS** - Styling
- **Leaflet & React-Leaflet** - Interactive maps
- **Lucide React** - Icons
- **Discord Embedded App SDK** - Discord Activity integration

### Backend
- **Fastify** - Fast and efficient Node.js web framework
- **PostgreSQL** - Database for locations and game state
- **Discord.js** - Discord bot integration
- **Node-cron** - Scheduled tasks for daily challenges
- **@fastify/cors** - Cross-origin resource sharing
- **@fastify/rate-limit** - API rate limiting
- **@fastify/static** - Static file serving
- **ES Modules** - Modern JavaScript

## Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- Docker and Docker Compose installed

### Installation

1. **Start PostgreSQL Database**
```bash
docker-compose up -d
```
This will start a PostgreSQL database on port 5432 and automatically initialize it with the schema and seed data.

2. **Set up Backend Environment**
```bash
cd backend
cp .env.example .env
npm install
```

Edit `backend/.env` and configure the following:
- `PORT` - Backend server port (default: 3001)
- `GA_MEASUREMENT_ID` - Google Analytics measurement ID (optional)
- `GA_API_SECRET` - Google Analytics API secret (optional)
- `DISCORD_CLIENT_ID` - Discord application client ID (required for Discord Activity)
- `DISCORD_CLIENT_SECRET` - Discord application client secret (required for Discord Activity)
- `DISCORD_BOT_TOKEN` - Discord bot token (required for Discord bot features)

**Note:** Discord credentials are required if you want to use the Discord Activity or bot features. For web-only usage, you can leave these blank.

3. **Install Frontend Dependencies**
```bash
cd frontend
npm install
```

### Running the Application

1. **Start the Backend Server** (Terminal 1)
```bash
cd backend
npm run dev
```
The backend will run on `http://localhost:3001`

2. **Start the Frontend Dev Server** (Terminal 2)
```bash
cd frontend
npm run dev
```
The frontend will run on `http://localhost:3000`

3. **Open your browser** and navigate to `http://localhost:3000`

### Database Management

**View database logs:**
```bash
docker-compose logs postgres
```

**Stop database:**
```bash
docker-compose down
```

**Reset database (delete all data):**
```bash
docker-compose down -v
docker-compose up -d
```

**Connect to database:**
```bash
docker exec -it locodle-postgres psql -U locodle -d locodle
```

## How to Play

1. Look at the image and hints provided
2. Search for a location using the search bar
3. Select your guess from the dropdown suggestions
4. See how far away you are from the actual location
5. Keep guessing until you find it or run out of tries!

## Game Mechanics

- **6 guesses maximum** per daily challenge
- **Distance feedback** shown for each guess (km or miles)
- **Win condition**: Guess within 50km of the actual location
- **New challenge** every day - automatically generated from a pool of 60+ locations
- **Hints available** to help you narrow down the location
- **Two ways to guess**: Search by name or click on the map

## API Endpoints

### Backend API

- `GET /api/health` - Health check
- `GET /api/daily-challenge` - Get today's challenge
- `POST /api/guess` - Submit a guess
- `GET /api/stats/:sessionId` - Get game statistics

## Project Structure

```
locodle-second/
├── backend/
│   ├── data/
│   │   └── locations.js           # Location database
│   ├── db/
│   │   ├── migrations/            # Database migrations
│   │   ├── connection.js          # PostgreSQL connection
│   │   └── init.sql               # Database schema
│   ├── scripts/
│   │   ├── check-locations.js     # Location validation script
│   │   ├── clear-today-location.js # Reset daily challenge
│   │   └── init-db.js             # Database initialization
│   ├── services/
│   │   ├── discordBot.js          # Discord bot service
│   │   └── locationGenerator.js   # Daily location generation
│   ├── server.js                  # Fastify server
│   ├── .env.example               # Environment variables template
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── DiscordActivityWrapper.jsx  # Discord Activity integration
│   │   │   ├── GameMap.jsx                 # Interactive map
│   │   │   ├── GuessInput.jsx              # Search and guess input
│   │   │   ├── GuessInputOverlay.jsx       # Overlay for guess input
│   │   │   ├── GuessHistory.jsx            # Guess history display
│   │   │   ├── GuessHistoryOverlay.jsx     # Overlay for guess history
│   │   │   ├── GameStats.jsx               # Game statistics
│   │   │   ├── HintsPanel.jsx              # Hints display
│   │   │   ├── GameOverModal.jsx           # Game over screen
│   │   │   └── UserStatsModal.jsx          # User statistics modal
│   │   ├── contexts/                       # React contexts
│   │   ├── App.jsx                         # Main app component
│   │   ├── main.jsx                        # Entry point
│   │   └── index.css                       # Global styles
│   ├── public/                             # Static assets
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
├── docker-compose.yml                      # PostgreSQL container config
└── README.md
```

## How Location Generation Works

The game automatically generates a new random location each day from a pool of 60+ famous landmarks, cities, and natural wonders. Locations are:

- **Randomly selected** each day
- **Stored in PostgreSQL** for consistency
- **Never repeated** within 30 days
- **Automatically generated** - no manual intervention needed

The location pool includes:
- Major world cities (Tokyo, New York, Paris, etc.)
- Famous landmarks (Pyramids, Stonehenge, etc.)
- Natural wonders (Grand Canyon, Mount Everest, etc.)

### Adding More Locations

To expand the location pool, edit `backend/services/locationGenerator.js` and add entries to the `LOCATION_TEMPLATES` array:

```javascript
{
  type: 'city', // or 'landmark' or 'natural'
  name: 'Location Name',
  lat: 12.3456,
  lng: 78.9012,
  country: 'Country'
}
```

Hints are automatically generated based on the location type, hemisphere, and continent.

## Discord Integration

### Setting Up Discord Activity

To enable the Discord Activity feature:

1. Create a Discord application at [Discord Developer Portal](https://discord.com/developers/applications)
2. Enable "Embedded App SDK" in your application settings
3. Add your application's Client ID to `backend/.env` as `DISCORD_CLIENT_ID`
4. Add your Client Secret to `backend/.env` as `DISCORD_CLIENT_SECRET`
5. The same Client ID must be hardcoded in `frontend/src/components/DiscordActivityWrapper.jsx`

### Setting Up Discord Bot

To enable the Discord bot for automated daily challenges:

1. Create a bot in your Discord application
2. Enable necessary bot permissions (Send Messages, Embed Links)
3. Add the bot token to `backend/.env` as `DISCORD_BOT_TOKEN`
4. Invite the bot to your Discord server
5. The bot will automatically post daily challenges using node-cron scheduling

## Database Scripts

Useful scripts for database management:

```bash
# Initialize database (run after docker-compose up)
cd backend
npm run init-db

# Check location data validity
node scripts/check-locations.js

# Clear today's location (for testing)
node scripts/clear-today-location.js
```

## Building for Production

### Frontend
```bash
cd frontend
npm run build
```

The build output will be in `frontend/dist/` and can be deployed to any static hosting service.

### Backend
The backend is ready for production as-is. Deploy to your preferred hosting platform (Heroku, Railway, Render, etc.) and ensure:
- PostgreSQL database is provisioned
- Environment variables are configured
- Port is properly exposed


## Credits

Built with ❤️ for geography enthusiasts worldwide!
