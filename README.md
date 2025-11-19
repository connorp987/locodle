# Locodle v2.0 🌍

A modern geo-location guessing game built with React and Fastify. Guess famous landmarks and locations around the world in 6 tries or less!

## Features

- 🗺️ Interactive map with guess visualization
- 🎯 Daily challenges with new locations
- 💡 Helpful hints for each location
- 📊 Real-time statistics and guess history
- 🎨 Beautiful, modern UI with TailwindCSS
- 📱 Responsive design

## Tech Stack

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **TailwindCSS** - Styling
- **Leaflet & React-Leaflet** - Interactive maps
- **Lucide React** - Icons

### Backend
- **Fastify** - Fast and efficient Node.js web framework
- **CORS** - Cross-origin resource sharing
- **ES Modules** - Modern JavaScript

## Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. **Install Backend Dependencies**
```bash
cd backend
npm install
```

2. **Install Frontend Dependencies**
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

## How to Play

1. Look at the image and hints provided
2. Search for a location using the search bar
3. Select your guess from the dropdown suggestions
4. See how far away you are from the actual location
5. Keep guessing until you find it or run out of tries!

## Game Mechanics

- **6 guesses maximum** per daily challenge
- **Distance feedback** shown for each guess
- **Win condition**: Guess within 50km of the actual location
- **New challenge** every day
- **Hints available** to help you narrow down the location

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
│   │   └── locations.js      # Location database
│   ├── server.js              # Fastify server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── GameMap.jsx
│   │   │   ├── GuessInput.jsx
│   │   │   ├── GuessHistory.jsx
│   │   │   ├── GameStats.jsx
│   │   │   └── HintsPanel.jsx
│   │   ├── App.jsx            # Main app component
│   │   ├── main.jsx           # Entry point
│   │   └── index.css          # Global styles
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
└── README.md
```

## Adding New Locations

Edit `backend/data/locations.js` to add new locations:

```javascript
{
  name: "Location Name",
  lat: 12.3456,
  lng: 78.9012,
  country: "Country",
  hints: [
    "Hint 1",
    "Hint 2",
    "Hint 3"
  ],
  imageUrl: "https://example.com/image.jpg"
}
```

## Building for Production

### Frontend
```bash
cd frontend
npm run build
```

### Backend
The backend is ready for production as-is. Deploy to your preferred hosting platform.

## Future Enhancements

- [ ] User accounts and persistent statistics
- [ ] Leaderboards
- [ ] Multiple game modes (unlimited, timed, etc.)
- [ ] Share results on social media
- [ ] More locations and categories
- [ ] Multiplayer mode

## License

MIT

## Credits

Built with ❤️ for geography enthusiasts worldwide!
