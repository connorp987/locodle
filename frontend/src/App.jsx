import { useState, useEffect, useRef, useCallback } from "react";
import {
  MapPin,
  Trophy,
  Info,
  Calendar,
  LogOut,
  X,
  Check,
  ChevronDown,
  Lightbulb,
  BarChart3,
} from "lucide-react";
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

const controlBtn =
  "inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-lg text-sm font-medium text-ink bg-white hover:bg-slate-100 transition-colors";

// Two-option toggle for header settings
function Segmented({ label, value, onChange, options }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex h-9 p-0.5 rounded-lg bg-slate-100"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={`px-2 sm:px-3 rounded-md text-sm font-medium transition-colors ${
              active
                ? "bg-white text-ink shadow-sm"
                : "text-ink-faint hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

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

  // Map-click guesses come back named by coordinates; fetch the place name
  // separately so the guess itself isn't held up by the lookup.
  const resolveGuessName = async (date, index, { lat, lng }) => {
    let patch = { pendingName: false };
    try {
      const response = await customFetch(
        `${API_BASE_URL}/api/geocode?lat=${lat}&lng=${lng}`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.name) {
          patch = { ...patch, guess: data.name, address: data.address || null };
        }
      }
    } catch (error) {
      console.error("Failed to look up guess name:", error);
    }

    const isSameGuess = (g) => g && g.lat === lat && g.lng === lng;

    // Update saved state for that day, even if the player switched days
    const key = `locodle-state-${date}`;
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (isSameGuess(saved?.guesses?.[index])) {
      saved.guesses[index] = { ...saved.guesses[index], ...patch };
      localStorage.setItem(key, JSON.stringify(saved));
    }

    setGuesses((prev) =>
      isSameGuess(prev[index])
        ? prev.map((g, i) => (i === index ? { ...g, ...patch } : g))
        : prev
    );
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
        // Search picks come with an address; map clicks get one later
        const guessEntry =
          location.address && !result.address
            ? { ...result, address: location.address }
            : result;
        const newGuesses = [...guesses, guessEntry];
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

        if (result.pendingName) {
          resolveGuessName(currentDate, newGuesses.length - 1, result);
        }
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <MapPin
            className="w-12 h-12 text-primary-600 motion-safe:animate-bounce mx-auto mb-3"
            strokeWidth={2.5}
            fill="currentColor"
            stroke="white"
          />
          <p className="text-lg font-medium text-ink-soft">
            Loading today&apos;s place…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col h-[100dvh] overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 flex-shrink-0 relative z-[1100]">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Wordmark */}
          <div className="flex items-center gap-2 mr-auto">
            <MapPin
              className="w-6 h-6 sm:w-7 sm:h-7 text-primary-600"
              strokeWidth={2.5}
              fill="currentColor"
              stroke="white"
            />
            <div className="leading-none">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-ink">
                Locodle
              </h1>
              <p className="hidden xl:block text-xs text-ink-soft mt-1">
                Find the famous place. Unlimited guesses.
              </p>
            </div>
          </div>

          {/* Game controls: full-width second row on mobile */}
          <div className="order-last md:order-none w-full md:w-auto flex items-center gap-1.5 sm:gap-2 justify-center md:justify-end flex-wrap">
            {/* Date Picker */}
            <div className="relative" ref={datePickerRef}>
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                aria-expanded={showDatePicker}
                className={`${controlBtn} border border-slate-200`}
              >
                <Calendar className="w-4 h-4 text-primary-600" />
                <span>{formatDisplayDate(currentDate)}</span>
                <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-ink-faint" />
              </button>

              {showDatePicker && (
                <>
                  {/* Backdrop for mobile */}
                  <div
                    className="fixed inset-0 bg-ink/30 z-[999] sm:hidden"
                    onClick={() => setShowDatePicker(false)}
                  />
                  <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 sm:absolute sm:left-0 sm:top-auto sm:translate-x-0 sm:translate-y-0 sm:mt-2 w-64 bg-white rounded-xl shadow-float border border-slate-200 z-[1000] overflow-hidden">
                    <p className="px-4 pt-3 pb-2 text-sm font-semibold text-ink">
                      Play a past day
                    </p>
                    <div className="max-h-64 overflow-y-auto pb-1">
                      {availableDates.map((date) => (
                        <button
                          key={date}
                          onClick={() => {
                            setCurrentDate(date);
                            setShowDatePicker(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                            currentDate === date
                              ? "bg-primary-50 text-primary-700 font-semibold"
                              : "text-ink-soft hover:bg-slate-50"
                          }`}
                        >
                          <span>{formatDisplayDate(date)}</span>
                          {currentDate === date && (
                            <Check className="w-4 h-4 text-primary-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <Segmented
              label="Distance unit"
              value={useKm ? "km" : "mi"}
              onChange={(v) => setUseKm(v === "km")}
              options={[
                { value: "mi", label: "mi", title: "Show distances in miles" },
                { value: "km", label: "km", title: "Show distances in kilometers" },
              ]}
            />

            <Segmented
              label="Difficulty"
              value={gameMode}
              onChange={setGameMode}
              options={[
                { value: "hard", label: "Hard", title: "Distance only" },
                { value: "easy", label: "Easy", title: "Adds hints and direction arrows" },
              ]}
            />

          </div>

          {/* Hints/Stats: icon-only in the top row on mobile */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setShowHintsModal(true)}
              aria-label="Hints"
              className={controlBtn}
            >
              <Lightbulb className="w-4 h-4 text-heat-warm" />
              <span className="hidden lg:inline">Hints</span>
            </button>

            {user && (
              <button
                onClick={() => setShowStatsModal(true)}
                aria-label="Stats"
                className={controlBtn}
              >
                <BarChart3 className="w-4 h-4 text-primary-600" />
                <span className="hidden lg:inline">Stats</span>
              </button>
            )}
          </div>

          {/* Account */}
          {user && (
            <div className="flex items-center gap-1.5 md:pl-3 md:border-l md:border-slate-200">
              <img
                src={getDiscordAvatarUrl(user)}
                alt=""
                className="w-8 h-8 rounded-full ring-2 ring-white shadow-sm"
              />
              <span className="hidden lg:inline text-sm font-medium text-ink">
                {user?.username}
              </span>
              {!isDiscord && (
                <button
                  onClick={logout}
                  className="p-2 text-ink-faint hover:text-ink hover:bg-slate-100 rounded-lg transition-colors"
                  title="Log out"
                  aria-label="Log out"
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
              className="flex items-center gap-2 h-9 px-3 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <DiscordIcon className="w-4 h-4" />
              <span className="lg:hidden">Sign in</span>
              <span className="hidden lg:inline">Sign in with Discord</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Map Section - Grows to fill available space */}
        <div
          ref={mapRef}
          className="flex-1 w-full relative z-0 min-h-[200px]"
        >
          <GameMap
            guesses={guesses}
            answer={answer}
            onMapClick={!gameCompleted ? handleMapClick : null}
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
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[1000]">
            <button
              onClick={() => setShowGameOverModal(true)}
              className="bg-ink hover:bg-ink-soft text-white font-semibold h-12 px-6 rounded-full flex items-center justify-center gap-2 transition-colors shadow-float"
            >
              <Trophy className="w-5 h-5 text-heat-warm" />
              See results
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
        <div
          className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-[2000] p-4"
          onClick={() => setShowHintsModal(false)}
        >
          <div
            role="dialog"
            aria-labelledby="hints-title"
            className="bg-white rounded-2xl shadow-float max-w-md w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2
                id="hints-title"
                className="text-xl font-bold text-ink flex items-center gap-2"
              >
                <Lightbulb className="w-5 h-5 text-heat-warm" />
                Hints
              </h2>
              <button
                onClick={() => setShowHintsModal(false)}
                aria-label="Close hints"
                className="text-ink-faint hover:text-ink hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 pb-5">
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
            className="flex items-start gap-2 bg-ink text-white px-4 py-3 rounded-xl shadow-float border-l-4 border-heat-fire"
          >
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-heat-fire" />
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
