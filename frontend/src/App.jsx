import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Trophy, Info, Calendar, LogOut, X } from "lucide-react";
import GameMap from "./components/GameMap";
import GuessInputOverlay from "./components/GuessInputOverlay";
import HintsPanel from "./components/HintsPanel";
import GameOverModal from "./components/GameOverModal";
import UserStatsModal from "./components/UserStatsModal";
import DiscordIcon from "./components/DiscordIcon";
import { useDiscord } from "./contexts/DiscordContext";
import { getEasternDateString, formatDisplayDate } from "./utils/dateUtils";
import { API_BASE_URL } from "./utils/apiUtils";
import { getDiscordAvatarUrl } from "./utils/discordUtils";

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
  const [showHintsModal, setShowHintsModal] = useState(false);
  const [tempMarker, setTempMarker] = useState(null);
  const [useKm, setUseKm] = useState(() => {
    const stored = localStorage.getItem("locodle-use-km");
    return stored ? JSON.parse(stored) : false; // Default to Miles (false)
  });
  const [gameMode, setGameMode] = useState(() => {
    const stored = localStorage.getItem("locodle-game-mode");
    return stored || "hard"; // Default to Hard mode
  });
  const [currentDate, setCurrentDate] = useState(() => {
    return getEasternDateString();
  });
  const [availableDates, setAvailableDates] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  const {
    isDiscord,
    trackEvent,
    user,
    isGuestMode,
    logout,
    setActivityStatus,
    closeActivity,
  } = useDiscord();

  const customFetch = useCallback(
    async (url, options = {}) => {
      if (isDiscord) {
        const relativeUrl = url.replace(API_BASE_URL, "");
        return fetch(relativeUrl, options);
      } else {
        return fetch(url, options);
      }
    },
    [isDiscord]
  );

  const loadAvailableDates = useCallback(async () => {
    try {
      const response = await customFetch(`${API_BASE_URL}/api/days`);
      const data = await response.json();
      // Normalize dates to clean YYYY-MM-DD strings to fix picker formatting
      const normalized = (data.dates || []).map((d) => {
        if (!d) return "";
        const dateStr = String(d);
        // Extract YYYY-MM-DD from ISO (T) or space-separated date strings
        if (dateStr.includes("T")) return dateStr.split("T")[0];
        if (dateStr.includes(" ")) return dateStr.split(" ")[0]; // Handle "2026-01-01 00:00:00"
        return dateStr;
      });
      setAvailableDates(normalized);
    } catch (error) {
      console.error("Failed to load available dates:", error);
    }
  }, [customFetch]);

  const loadDailyChallenge = useCallback(async () => {
    try {
      const response = await customFetch(
        `${API_BASE_URL}/api/daily-challenge?date=${currentDate}`
      );
      if (!response.ok) throw new Error("Failed to load challenge");
      const data = await response.json();
      setChallenge(data);
    } catch (error) {
      console.error("Failed to load daily challenge:", error);
    }
  }, [currentDate, customFetch]);

  useEffect(() => {
    loadAvailableDates();
    trackEvent("page_view", { page_title: "Daily Challenge" });
  }, [loadAvailableDates, trackEvent]);

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
  }, [currentDate, loadDailyChallenge]);

  // Persist useKm preference to localStorage
  useEffect(() => {
    localStorage.setItem("locodle-use-km", JSON.stringify(useKm));
  }, [useKm]);

  // Sync guesses from server when user becomes available (cross-device sync)
  useEffect(() => {
    if (!user?.id) return;

    const syncServerGuesses = async () => {
      try {
        const response = await customFetch(
          `${API_BASE_URL}/api/user/${user?.id}/guesses/${currentDate}`
        );
        if (!response.ok) return;

        const data = await response.json();
        const serverGuesses = data.guesses || [];
        const serverAnswer = data.answer || null;
        if (serverGuesses.length === 0) return;

        // Get current local state
        const savedState = localStorage.getItem(`locodle-state-${currentDate}`);
        const parsedSaved = savedState ? JSON.parse(savedState) : {};
        const localGuesses = parsedSaved.guesses || [];
        const localAnswer = parsedSaved.answer || null;

        // If server has more guesses than local, or we are missing the answer locally
        if (
          serverGuesses.length > localGuesses.length ||
          (!localAnswer && serverAnswer)
        ) {
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
          const isWin = lastGuess && lastGuess.distance < 50;

          const finalAnswer = serverAnswer || localAnswer;

          if (isWin) {
            setGameCompleted(true);
            setGameWon(true);
            setAnswer(finalAnswer);
            setShowGameOverModal(true);
          }

          // Update localStorage with server data
          localStorage.setItem(
            `locodle-state-${currentDate}`,
            JSON.stringify({
              guesses: transformedGuesses,
              completed: isWin,
              won: isWin,
              answer: finalAnswer,
            })
          );
        }
      } catch (error) {
        console.error("Failed to sync server guesses:", error);
      }
    };

    syncServerGuesses();
  }, [user?.id, currentDate, customFetch]);

  // Save unit preference when it changes
  useEffect(() => {
    localStorage.setItem("locodle-use-km", JSON.stringify(useKm));
  }, [useKm]);

  // Save game mode preference
  useEffect(() => {
    localStorage.setItem("locodle-game-mode", gameMode);
  }, [gameMode]);

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
          gameMode: gameMode,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        const newGuesses = [...guesses, result];
        setGuesses(newGuesses);
        setTempMarker(null); // Clear temp marker after successful guess

        let newCompleted = result.completed;
        let newWon = result.won;
        let newAnswer = result.answer;

        // Track Guess
        trackEvent("guess", {
          guess_number: guesses.length + 1,
          distance: result.distance,
          won: result.won,
        });

        if (result.completed) {
          setGameCompleted(true);
          setGameWon(result.won);
          setAnswer(result.answer);
          setShowGameOverModal(true);

          const guessCount = guesses.length + 1;
          if (result.won) {
            setActivityStatus(
              `Found it in ${guessCount} guess${
                guessCount > 1 ? "es" : ""
              }! 🎉`,
              "Locodle",
              true
            );
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
        showToast(result.error || "Failed to submit guess");
      }
    } catch (error) {
      console.error("Failed to submit guess:", error);
      showToast("Failed to submit guess. Check your connection.");
    } finally {
      isSubmitting.current = false;
      setSubmitting(false);
    }
  };

  const handleShareAndExit = async () => {
    console.log("handleShareAndExit called");
    if (isDiscord) {
      console.log("In Discord environment, closing activity");
      setShowGameOverModal(false);
      await closeActivity();
    } else {
      console.log("Not in Discord, closing modal only");
      setShowGameOverModal(false);
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
          <p className="text-xl text-gray-700">
            Loading today&apos;s challenge...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col h-[100dvh] overflow-hidden">
      {/* Header */}
      <header className="bg-white shadow-md flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 py-0.5 sm:py-1">
          {/* Top row: Logo + User */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <MapPin className="w-4 h-4 sm:w-6 sm:h-6 md:w-8 md:h-8 text-primary-600" />
              <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-gray-900">
                Locodle
              </h1>
            </div>
            {/* User Avatar or Guest Sign-in - always visible on right */}
            {user && (
              <div className="flex items-center gap-2 md:hidden">
                <img
                  src={getDiscordAvatarUrl(user)}
                  alt={user?.username}
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
            {isGuestMode && !user && !isDiscord && (
              <button
                onClick={() => {
                  localStorage.removeItem("locodle-guest-mode");
                  window.location.reload();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm rounded-lg transition-colors md:hidden"
                title="Sign in with Discord"
              >
                <DiscordIcon className="w-4 h-4" />
                Sign in
              </button>
            )}
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-center md:justify-between">
            {/* Game controls */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {/* Date Picker */}
              <div className="relative" ref={datePickerRef}>
                <button
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-sm md:text-base"
                >
                  <Calendar className="w-4 h-4 md:w-5 md:h-5 text-primary-600" />
                  <span className="font-medium">
                    {formatDisplayDate(currentDate)}
                  </span>
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
                            <span>{formatDisplayDate(date)}</span>
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
                title={`Distance in ${
                  useKm ? "kilometers" : "miles"
                } — tap to switch to ${useKm ? "miles" : "kilometers"}`}
                className="px-3 py-1.5 md:px-4 md:py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm md:text-base"
              >
                {useKm ? "km" : "mi"}
              </button>

              <button
                onClick={() =>
                  setGameMode(gameMode === "hard" ? "easy" : "hard")
                }
                title={
                  gameMode === "hard"
                    ? "Hard mode: distance only. Tap for Easy (adds hints + direction arrows)."
                    : "Easy mode: hints + direction arrows shown. Tap for Hard (distance only)."
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
                onClick={() => setShowHintsModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition-colors text-sm md:text-base"
              >
                <Info className="w-4 h-4 md:w-5 md:h-5" />
                <span className="hidden sm:inline">View</span> Hints
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
                  src={getDiscordAvatarUrl(user)}
                  alt={user?.username}
                  className="w-8 h-8 rounded-full"
                />
                <span className="text-sm font-medium text-gray-700">
                  {user?.username}
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
            {/* Guest mode - show Discord sign-in button */}
            {isGuestMode && !user && !isDiscord && (
              <div className="hidden md:flex items-center gap-2 pl-3 border-l border-gray-200">
                <button
                  onClick={() => {
                    localStorage.removeItem("locodle-guest-mode");
                    window.location.reload();
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  Sign in with Discord
                </button>
              </div>
            )}
          </div>

          <p className="text-gray-600 mt-2 text-sm md:text-base text-center md:text-left">
            Guess the famous location! Unlimited tries.
          </p>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Map Section - Grows to fill available space */}
        <div
          ref={mapRef}
          className="flex-1 w-full shadow-lg relative z-0 min-h-[200px]"
        >
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

        {/* GuessInput Overlay - Bottom of map */}
        <GuessInputOverlay
          gameCompleted={gameCompleted}
          onGuess={handleGuess}
          onConfirm={handleConfirmLocation}
          guessCount={guesses.length}
          tempMarker={tempMarker}
          onClearMarker={() => setTempMarker(null)}
          isSubmitting={submitting}
        />

        {/* Floating Action Buttons */}
        {gameCompleted && (
          <div className="absolute bottom-4 right-4 z-[1000]">
            <button
              onClick={() => setShowGameOverModal(true)}
              className="bg-white hover:bg-gray-50 text-gray-900 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg border-2 border-primary-600"
              title="View Results & Share"
            >
              <Trophy className="w-5 h-5 text-yellow-500" />
              <span className="hidden sm:inline">Results</span>
            </button>
          </div>
        )}
      </main>

      {/* Modals */}
      {/* User Stats Modal */}
      {showStatsModal && user && (
        <UserStatsModal
          user={user}
          isDiscord={isDiscord}
          onClose={() => setShowStatsModal(false)}
        />
      )}

      {/* Hints Modal */}
      {showHintsModal && challenge?.hints && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Info className="w-6 h-6 text-primary-600" />
                Hints
              </h2>
              <button
                onClick={() => setShowHintsModal(false)}
                aria-label="Close hints"
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              <HintsPanel hints={challenge.hints} />
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[4000] px-4 w-full max-w-sm">
          <div
            role="alert"
            className="flex items-start gap-2 bg-red-600 text-white px-4 py-3 rounded-xl shadow-2xl"
          >
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium flex-1">{toast}</p>
            <button
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="flex-shrink-0 text-white/80 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      <GameOverModal
        isOpen={showGameOverModal}
        gameWon={gameWon}
        answer={answer}
        guesses={guesses}
        isDiscord={isDiscord}
        onShareAndExit={handleShareAndExit}
        onClose={() => setShowGameOverModal(false)}
      />
    </div>
  );
}

export default App;
