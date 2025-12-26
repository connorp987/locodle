import { useState, useEffect, useRef } from "react";
import { MapPin, Trophy, Target, Info, Calendar, LogOut } from "lucide-react";
import GameMap from "./components/GameMap";
import GuessInput from "./components/GuessInput";
import GuessHistory from "./components/GuessHistory";
import GameStats from "./components/GameStats";
import HintsPanel from "./components/HintsPanel";
import GuessResultModal from "./components/GuessResultModal";
import UserStatsModal from "./components/UserStatsModal";
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
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const { isDiscord, sdk, trackEvent, user, logout, setActivityStatus } =
    useDiscord();

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

  // Load game state when date changes
  useEffect(() => {
    setLoading(true);

    // Load game state from local storage first (instant)
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

  // Sync guesses from server when user becomes available (cross-device sync)
  useEffect(() => {
    if (!user?.id) return;

    const syncServerGuesses = async () => {
      try {
        const response = await customFetch(
          `${API_BASE_URL}/api/user/${user.id}/guesses/${currentDate}`
        );
        if (!response.ok) return;

        const data = await response.json();
        const serverGuesses = data.guesses || [];
        if (serverGuesses.length === 0) return;

        // Get current local state
        const savedState = localStorage.getItem(`locodle-state-${currentDate}`);
        const localGuesses = savedState
          ? JSON.parse(savedState).guesses || []
          : [];

        // If server has more guesses than local, use server data
        if (serverGuesses.length > localGuesses.length) {
          // Transform server format to match local format
          const transformedGuesses = serverGuesses.map((g) => ({
            guess: g.location_name,
            lat: parseFloat(g.lat),
            lng: parseFloat(g.lng),
            distance: g.distance,
            score: parseFloat(g.score),
            direction: g.direction,
            timestamp: g.timestamp,
          }));

          setGuesses(transformedGuesses);

          // Check if last guess was a win (distance < 50km)
          const lastGuess = transformedGuesses[transformedGuesses.length - 1];
          if (lastGuess && lastGuess.distance < 50) {
            setGameCompleted(true);
            setGameWon(true);
          }

          // Update localStorage with server data
          localStorage.setItem(
            `locodle-state-${currentDate}`,
            JSON.stringify({
              guesses: transformedGuesses,
              completed: lastGuess?.distance < 50,
              won: lastGuess?.distance < 50,
              answer: null,
            })
          );
        }
      } catch (error) {
        console.error("Failed to sync server guesses:", error);
      }
    };

    syncServerGuesses();
  }, [user?.id, currentDate]);

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
          discord_user_id: user?.id,
          username: user?.username,
          avatar: user?.avatar,
          guild_id: user?.guild_id,
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

          // Update Discord Activity status to show completion
          const guessCount = guesses.length + 1;
          if (result.won) {
            setActivityStatus(
              `Found it in ${guessCount} guess${
                guessCount > 1 ? "es" : ""
              }! 🎉`,
              "Locodle",
              true // Persist status after activity ends
            );
          } else {
            setActivityStatus(
              `Game Over - ${guessCount} guesses`,
              "Locodle",
              true
            );
          }
        } else {
          // Show result modal if game is not completed and history is collapsed
          if (!historyExpanded) {
            setShowResultModal(true);
          }
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
          {/* Top row: Logo + User */}
          <div className="flex items-center justify-between mb-2 md:mb-0">
            <div className="flex items-center gap-2 md:gap-3">
              <MapPin className="w-6 h-6 md:w-8 md:h-8 text-primary-600" />
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                Locodle
              </h1>
            </div>
            {/* User Avatar - always visible on right */}
            {user && (
              <div className="flex items-center gap-2 md:hidden">
                <img
                  src={
                    user.avatar
                      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                      : `https://cdn.discordapp.com/embed/avatars/${
                          parseInt(user.id) % 5
                        }.png`
                  }
                  alt={user.username}
                  className="w-8 h-8 rounded-full"
                />
                {!isDiscord && (
                  <button
                    onClick={logout}
                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Logout"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-center md:justify-between">
            {/* Game controls */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <div className="relative" ref={datePickerRef}>
                <button
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-sm md:text-base"
                >
                  <Calendar className="w-4 h-4 md:w-5 md:h-5 text-primary-600" />
                  <span className="font-medium">{currentDate}</span>
                </button>

                {showDatePicker && (
                  <>
                    {/* Backdrop for mobile */}
                    <div
                      className="fixed inset-0 bg-black/20 z-[999] sm:hidden"
                      onClick={() => setShowDatePicker(false)}
                    />
                    <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 sm:absolute sm:left-0 sm:top-auto sm:translate-x-0 sm:translate-y-0 sm:mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-[1000] overflow-hidden">
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
                  </>
                )}
              </div>

              <button
                onClick={() => setUseKm(!useKm)}
                className="px-3 py-1.5 md:px-4 md:py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm md:text-base"
              >
                {useKm ? "km" : "mi"}
              </button>

              <button
                onClick={() =>
                  setGameMode(gameMode === "hard" ? "easy" : "hard")
                }
                className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg transition-colors font-medium text-sm md:text-base ${
                  gameMode === "hard"
                    ? "bg-red-100 text-red-700 hover:bg-red-200"
                    : "bg-green-100 text-green-700 hover:bg-green-200"
                }`}
              >
                {gameMode === "hard" ? "🔥 Hard" : "😊 Easy"}
              </button>

              <button
                onClick={() => setShowHints(!showHints)}
                className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition-colors text-sm md:text-base"
              >
                <Info className="w-4 h-4 md:w-5 md:h-5" />
                <span className="hidden sm:inline">
                  {showHints ? "Hide" : "Show"}
                </span>{" "}
                Hints
              </button>

              {user && (
                <button
                  onClick={() => setShowStatsModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors text-sm md:text-base"
                >
                  <Trophy className="w-4 h-4 md:w-5 md:h-5" />
                  Stats
                </button>
              )}
            </div>

            {/* Desktop user section */}
            {user && (
              <div className="hidden md:flex items-center gap-2 pl-3 border-l border-gray-200">
                <img
                  src={
                    user.avatar
                      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                      : `https://cdn.discordapp.com/embed/avatars/${
                          parseInt(user.id) % 5
                        }.png`
                  }
                  alt={user.username}
                  className="w-8 h-8 rounded-full"
                />
                <span className="text-sm font-medium text-gray-700">
                  {user.username}
                </span>
                {!isDiscord && (
                  <button
                    onClick={logout}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Logout"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="text-gray-600 mt-2 text-sm md:text-base text-center md:text-left">
            Guess the famous location! Unlimited tries.
          </p>
        </div>
      </header>

      <main className="w-full pb-8">
        {/* Map Section - Full Width */}
        <div ref={mapRef} className="w-full shadow-lg relative z-0">
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
              isHistoryExpanded={historyExpanded}
              onHistoryToggle={setHistoryExpanded}
            />
          </div>
        </div>

        {/* Bottom Section - Input and Stats */}
        <div className="max-w-7xl mx-auto px-4 mt-8 space-y-6">
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

      {/* User Stats Modal */}
      {showStatsModal && user && (
        <UserStatsModal
          user={user}
          isDiscord={isDiscord}
          onClose={() => setShowStatsModal(false)}
        />
      )}
    </div>
  );
}

export default App;
