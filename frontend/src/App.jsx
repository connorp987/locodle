import { useState, useEffect, useRef } from "react";
import { MapPin, Trophy, Target, Info, Calendar } from "lucide-react";
import GameMap from "./components/GameMap";
import GuessInput from "./components/GuessInput";
import GuessHistory from "./components/GuessHistory";
import GameStats from "./components/GameStats";
import HintsPanel from "./components/HintsPanel";
import GuessResultModal from "./components/GuessResultModal";
import { useDiscord } from "./components/DiscordActivityWrapper";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
  const [gameMode, setGameMode] = useState(() => {
    const stored = localStorage.getItem("locodle-game-mode");
    return stored || "hard"; // Default to Hard mode
  });
  const [currentDate, setCurrentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [availableDates, setAvailableDates] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const { isDiscord, sdk, trackEvent } = useDiscord();

  // Helper for fetching data that works in both browser and Discord
  const customFetch = async (url, options = {}) => {
    if (isDiscord) {
      // In Discord, we must use relative URLs to satisfy CSP.
      // Discord's proxy will route these based on the URL Mappings in the Developer Portal.
      // We strip the API_BASE_URL to get the relative path (e.g. "/api/guess").
      const relativeUrl = url.replace(API_BASE_URL, "");
      return fetch(relativeUrl, options);
    } else {
      // Standard Browser Fetch
      return fetch(url, options);
    }
  };

  useEffect(() => {
    loadAvailableDates();
    trackEvent("page_view", { page_title: "Daily Challenge" });
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

  // Save game mode preference
  useEffect(() => {
    localStorage.setItem("locodle-game-mode", gameMode);
  }, [gameMode]);

  const loadAvailableDates = async () => {
    try {
      const response = await customFetch(`${API_BASE_URL}/api/days`);
      const data = await response.json();
      setAvailableDates(data.dates || []);
    } catch (error) {
      console.error("Failed to load available dates:", error);
    }
  };

  const loadDailyChallenge = async () => {
    try {
      const response = await customFetch(
        `${API_BASE_URL}/api/daily-challenge?date=${currentDate}`
      );
      if (!response.ok) throw new Error("Failed to load challenge");
      const data = await response.json();
      setChallenge(data);
    } catch (error) {
      console.error("Failed to load challenge:", error);
    }
  };

  // Removed loadGameState as we now use localStorage

  const handleMapClick = (latlng) => {
    if (!gameCompleted) {
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
    // Prevent double submissions
    if (isSubmitting.current || gameCompleted) return;

    isSubmitting.current = true;
    setSubmitting(true);

    // Unlimited guesses, so never "last guess" based on count
    const isLastGuess = false;

    try {
      const response = await customFetch(`${API_BASE_URL}/api/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guess: location,
          date: currentDate,
          isLastGuess,
          guessCount: guesses.length + 1,
          discord_user_id: sdk?.currentUser?.id,
          username: sdk?.currentUser?.username,
          avatar: sdk?.currentUser?.avatar,
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

        // Track Guess
        trackEvent("guess", {
          guess_number: guesses.length + 1,
          distance: result.distance,
          won: result.won,
        });

        if (result.completed) {
          newCompleted = true;
          newWon = result.won;
          newAnswer = result.answer;
          setGameCompleted(true);
          setGameWon(result.won);
          setAnswer(result.answer);

          // Track Game Completion
          trackEvent("game_complete", {
            won: result.won,
            total_guesses: guesses.length + 1,
          });
        } else {
          // Show result modal if game is not completed
          // setShowResultModal(true);
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

  const mapRef = useRef(null);
  const datePickerRef = useRef(null);

  // Auto-scroll to map when in Discord
  useEffect(() => {
    if (isDiscord && !loading && mapRef.current) {
      // Small delay to ensure layout is stable after loading screen removal
      setTimeout(() => {
        mapRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 500);
    }
  }, [isDiscord, loading]);

  // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        datePickerRef.current &&
        !datePickerRef.current.contains(event.target)
      ) {
        setShowDatePicker(false);
      }
    };

    if (showDatePicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDatePicker]);

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
        <div className="max-w-7xl mx-auto px-4 py-3 md:py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-0">
            <div className="flex items-center gap-2 md:gap-3">
              <MapPin className="w-6 h-6 md:w-8 md:h-8 text-primary-600" />
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                Locodle
              </h1>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto justify-center md:justify-end flex-wrap">
              <div className="relative" ref={datePickerRef}>
                <button
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <Calendar className="w-5 h-5 text-primary-600" />
                  <span className="font-medium">{currentDate}</span>
                </button>

                {showDatePicker && (
                  <div className="absolute left-0 md:left-auto md:right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-[1000] overflow-hidden">
                    <div className="p-3 bg-gray-50 border-b border-gray-100">
                      <h3 className="font-semibold text-gray-700">
                        Select Date
                      </h3>
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
                onClick={() =>
                  setGameMode(gameMode === "hard" ? "easy" : "hard")
                }
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium ${
                  gameMode === "hard"
                    ? "bg-red-100 text-red-700 hover:bg-red-200"
                    : "bg-green-100 text-green-700 hover:bg-green-200"
                }`}
              >
                {gameMode === "hard" ? "🔥 Hard" : "😊 Easy"}
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
            Guess the famous location! Unlimited tries.
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Map Section - Full Width */}
        <div
          ref={mapRef}
          className="bg-white rounded-xl shadow-lg overflow-hidden"
        >
          <div className="h-[600px]">
            <GameMap
              guesses={guesses}
              answer={answer}
              onMapClick={!gameCompleted ? handleMapClick : null}
              onConfirm={!gameCompleted ? handleConfirmLocation : null}
              isSubmitting={submitting}
              tempMarker={tempMarker}
              useKm={useKm}
              isDiscord={isDiscord}
              gameMode={gameMode}
            />
          </div>
        </div>

        {/* Bottom Section - Input and Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Input and Game Over */}
          <div className="space-y-6">
            {/* Guess Input */}
            {!gameCompleted && (
              <GuessInput
                onGuess={handleGuess}
                onConfirm={handleConfirmLocation}
                disabled={gameCompleted}
                guessCount={guesses.length}
                maxGuesses={-1} // Unlimited
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

          {/* Right Column - Stats and Hints */}
          <div className="space-y-6">
            {showHints && challenge?.hints && (
              <HintsPanel hints={challenge.hints} />
            )}

            <GameStats
              guesses={guesses}
              maxGuesses={-1}
              completed={gameCompleted}
              won={gameWon}
              useKm={useKm}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white mt-12 py-6 border-t">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-600">
          <p>© 2024 Locodle. A daily geo-location guessing game.</p>
        </div>
      </footer>

      {/* Result Modal */}
      {showResultModal && !gameCompleted && guesses.length > 0 && (
        <GuessResultModal
          guess={guesses[guesses.length - 1]}
          isHotter={
            guesses.length > 1
              ? guesses[guesses.length - 1].distance <
                guesses[guesses.length - 2].distance
              : null
          }
          onClose={() => setShowResultModal(false)}
          useKm={useKm}
          gameMode={gameMode}
        />
      )}
    </div>
  );
}

export default App;
