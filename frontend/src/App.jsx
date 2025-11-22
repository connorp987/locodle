import { useState, useEffect, useRef } from "react";
import { MapPin, Trophy, Target, Info, Calendar } from "lucide-react";
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
  // Session ID is no longer needed for state, but we can keep a random ID for the user if needed later
  // For now, we'll just remove the session ID state entirely as it's not used for local storage
  const [loading, setLoading] = useState(true);
  const submittingRef = useState(false); // Keep state for UI updates
  const isSubmitting = useRef(false); // Use ref for logic checks
  const [submitting, setSubmitting] = submittingRef; // Alias for compatibility
  const [showHints, setShowHints] = useState(false);
  const [tempMarker, setTempMarker] = useState(null);
  const [useKm, setUseKm] = useState(() => {
    const stored = localStorage.getItem("locodle-use-km");
    return stored ? JSON.parse(stored) : false; // Default to Miles (false)
  });
  const [currentDate, setCurrentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [availableDates, setAvailableDates] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    loadAvailableDates();
  }, []);

  useEffect(() => {
    setLoading(true);
    
    // Load game state from local storage
    const savedState = localStorage.getItem(`locodle-state-${currentDate}`);
    if (savedState) {
      const parsed = JSON.parse(savedState);
      setGuesses(parsed.guesses || []);
      setGameCompleted(parsed.completed || false);
      setGameWon(parsed.won || false);
      setAnswer(parsed.answer || null);
    } else {
      // Reset game state for new day
      setGuesses([]);
      setGameCompleted(false);
      setGameWon(false);
      setAnswer(null);
    }
    setTempMarker(null);
    
    loadDailyChallenge().finally(() => {
      setLoading(false);
    });
  }, [currentDate]);

  // Save unit preference when it changes
  useEffect(() => {
    localStorage.setItem("locodle-use-km", JSON.stringify(useKm));
  }, [useKm]);

  const loadAvailableDates = async () => {
    try {
      const response = await fetch("/api/days");
      const data = await response.json();
      setAvailableDates(data.dates || []);
    } catch (error) {
      console.error("Failed to load available dates:", error);
    }
  };

  const loadDailyChallenge = async () => {
    try {
      const response = await fetch(`/api/daily-challenge?date=${currentDate}`);
      if (!response.ok) throw new Error("Failed to load challenge");
      const data = await response.json();
      setChallenge(data);
    } catch (error) {
      console.error("Failed to load challenge:", error);
    }
  };

  // Removed loadGameState as we now use localStorage

  const handleMapClick = (latlng) => {
    if (!gameCompleted && guesses.length < 6) {
      setTempMarker(latlng);
    }
  };

  const handleConfirmLocation = (latlng) => {
    // 1. Submit guess immediately with coordinates as name
    const coordinateName = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    
    // 2. Submit guess (backend will handle reverse geocoding)
    handleGuess({
      name: coordinateName,
      lat: latlng.lat,
      lng: latlng.lng,
    });
  };

  const handleGuess = async (location) => {
    // Prevent double submissions or extra guesses
    if (isSubmitting.current || gameCompleted || guesses.length >= 6) return;
    
    isSubmitting.current = true;
    setSubmitting(true);

    // Check if this is the last allowed guess (6th guess, index 5)
    const isLastGuess = guesses.length === 5;

    try {
      const response = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guess: location,
          date: currentDate,
          isLastGuess,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        const newGuesses = [...guesses, result];
        setGuesses(newGuesses);
        setTempMarker(null); // Clear temp marker after successful guess

        let newCompleted = gameCompleted;
        let newWon = gameWon;
        let newAnswer = answer;

        if (result.completed) {
          newCompleted = true;
          newWon = result.won;
          newAnswer = result.answer;
          setGameCompleted(true);
          setGameWon(result.won);
          setAnswer(result.answer);
        }

        // Save to local storage
        localStorage.setItem(
          `locodle-state-${currentDate}`,
          JSON.stringify({
            guesses: newGuesses,
            completed: newCompleted,
            won: newWon,
            answer: newAnswer,
          })
        );
      } else {
        alert(result.error || "Failed to submit guess");
      }
    } catch (error) {
      console.error("Failed to submit guess:", error);
      alert("Failed to submit guess");
    } finally {
      isSubmitting.current = false;
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
              <div className="relative">
                <button
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <Calendar className="w-5 h-5 text-primary-600" />
                  <span className="font-medium">{currentDate}</span>
                </button>

                {showDatePicker && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                    <div className="p-3 bg-gray-50 border-b border-gray-100">
                      <h3 className="font-semibold text-gray-700">Select Date</h3>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {availableDates.map((date) => (
                        <button
                          key={date}
                          onClick={() => {
                            setCurrentDate(date);
                            setShowDatePicker(false);
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between ${
                            currentDate === date
                              ? "bg-primary-50 text-primary-700 font-medium"
                              : "text-gray-600"
                          }`}
                        >
                          <span>{date}</span>
                          {currentDate === date && (
                            <div className="w-2 h-2 rounded-full bg-primary-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

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
