import { useState, useEffect } from "react";
import { MapPin, Trophy, Target, Info } from "lucide-react";
import GameMap from "./components/GameMap";
import GuessInput from "./components/GuessInput";
import GuessHistory from "./components/GuessHistory";
import GameStats from "./components/GameStats";
import HintsPanel from "./components/HintsPanel";

function App() {
  const [challenge, setChallenge] = useState(null);
  const [guesses, setGuesses] = useState([]);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [sessionId] = useState(() => {
    const stored = localStorage.getItem("locodle-session");
    if (stored) return stored;
    const newId = `session-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    localStorage.setItem("locodle-session", newId);
    return newId;
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [tempMarker, setTempMarker] = useState(null);
  const [useKm, setUseKm] = useState(true);

  useEffect(() => {
    loadDailyChallenge();
    loadGameState();
  }, []);

  const loadDailyChallenge = async () => {
    try {
      const response = await fetch("/api/daily-challenge");
      const data = await response.json();
      setChallenge(data);
      setLoading(false);
    } catch (error) {
      console.error("Failed to load challenge:", error);
      setLoading(false);
    }
  };

  const loadGameState = async () => {
    try {
      const response = await fetch(`/api/stats/${sessionId}`);
      const data = await response.json();
      setGuesses(data.guesses || []);
      setGameCompleted(data.completed || false);
      setGameWon(data.won || false);
    } catch (error) {
      console.error("Failed to load game state:", error);
    }
  };

  const handleMapClick = (latlng) => {
    if (!gameCompleted) {
      setTempMarker({ lat: latlng.lat, lng: latlng.lng });
    }
  };

  const handleConfirmLocation = async (latlng) => {
    if (submitting) return;
    setSubmitting(true);

    // 1. Submit guess immediately with coordinates as name
    const coordinateName = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    
    // We need to capture the index of this new guess to update it later
    const guessIndex = guesses.length;

    try {
      // Start the guess submission
      await handleGuess({
        name: coordinateName,
        lat: latlng.lat,
        lng: latlng.lng,
      });

      // 2. Fetch real name in background
      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}`
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.display_name) {
            // Update the guess name in state
            setGuesses((prev) => {
              const newGuesses = [...prev];
              // Find the guess that matches our coordinates (in case index shifted, though unlikely in this flow)
              // But using index is safe here since we append
              if (newGuesses[guessIndex]) {
                newGuesses[guessIndex] = {
                  ...newGuesses[guessIndex],
                  guess: data.display_name,
                };
              }
              return newGuesses;
            });
          }
        })
        .catch((err) => console.error("Failed to fetch location name:", err));
    } catch (error) {
      console.error("Error submitting guess:", error);
    }
  };

  const handleGuess = async (location) => {
    // If not already submitting (called directly from input), set it
    if (!submitting) setSubmitting(true);

    try {
      const response = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guess: location,
          sessionId,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setGuesses((prev) => [...prev, result]);
        setTempMarker(null); // Clear temp marker after successful guess

        if (result.completed) {
          setGameCompleted(true);
          setGameWon(result.won);
          setAnswer(result.answer);
        }
      } else {
        alert(result.error || "Failed to submit guess");
      }
    } catch (error) {
      console.error("Failed to submit guess:", error);
      alert("Failed to submit guess");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <MapPin className="w-16 h-16 text-primary-600 animate-pulse mx-auto mb-4" />
          <p className="text-xl text-gray-700">Loading today's challenge...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MapPin className="w-8 h-8 text-primary-600" />
              <h1 className="text-3xl font-bold text-gray-900">Locodle</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setUseKm(!useKm)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {useKm ? "km" : "mi"}
              </button>
              <button
                onClick={() => setShowHints(!showHints)}
                className="flex items-center gap-2 px-4 py-2 bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition-colors"
              >
                <Info className="w-5 h-5" />
                {showHints ? "Hide" : "Show"} Hints
              </button>
            </div>
          </div>
          <p className="text-gray-600 mt-2">
            Guess the famous location in 6 tries or less!
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Map and Input */}
          <div className="lg:col-span-2 space-y-6">
            {/* Map */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="h-[600px]">
                <GameMap
                  guesses={guesses}
                  answer={answer}
                  onMapClick={!gameCompleted ? handleMapClick : null}
                  onConfirm={!gameCompleted ? handleConfirmLocation : null}
                  isSubmitting={submitting}
                  tempMarker={tempMarker}
                  useKm={useKm}
                />
              </div>
            </div>

            {/* Guess Input */}
            {!gameCompleted && (
              <GuessInput
                onGuess={handleGuess}
                onConfirm={handleConfirmLocation}
                disabled={gameCompleted}
                guessCount={guesses.length}
                maxGuesses={challenge?.maxGuesses || 6}
                tempMarker={tempMarker}
                onClearMarker={() => setTempMarker(null)}
              />
            )}

            {/* Game Over Message */}
            {gameCompleted && (
              <div
                className={`bg-white rounded-xl shadow-lg p-6 text-center ${
                  gameWon
                    ? "border-4 border-green-500"
                    : "border-4 border-red-500"
                }`}
              >
                {gameWon ? (
                  <>
                    <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
                    <h2 className="text-3xl font-bold text-green-600 mb-2">
                      Congratulations! 🎉
                    </h2>
                    <p className="text-xl text-gray-700">
                      You found{" "}
                      <span className="font-bold">{answer?.name}</span>,{" "}
                      {answer?.country} in {guesses.length}{" "}
                      {guesses.length === 1 ? "guess" : "guesses"}!
                    </p>
                  </>
                ) : (
                  <>
                    <Target className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-3xl font-bold text-red-600 mb-2">
                      Game Over
                    </h2>
                    <p className="text-xl text-gray-700">
                      The answer was{" "}
                      <span className="font-bold">{answer?.name}</span>,{" "}
                      {answer?.country}
                    </p>

                  </>
                )}
                <p className="text-gray-500 mt-4">
                  Come back tomorrow for a new challenge!
                </p>
              </div>
            )}
          </div>

          {/* Right Column - Stats and History */}
          <div className="space-y-6">
            <GameStats
              guesses={guesses}
              maxGuesses={challenge?.maxGuesses || 6}
              completed={gameCompleted}
              won={gameWon}
              useKm={useKm}
            />

            {showHints && challenge?.hints && (
              <HintsPanel hints={challenge.hints} />
            )}

            <GuessHistory guesses={guesses} useKm={useKm} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white mt-12 py-6 border-t">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-600">
          <p>© 2024 Locodle. A daily geo-location guessing game.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
