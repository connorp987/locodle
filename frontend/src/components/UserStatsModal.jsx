import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import { X, ChevronRight, ChevronLeft, User } from "lucide-react";
import { API_BASE_URL } from "../utils/apiUtils";
import { formatDate } from "../utils/dateUtils";
import { getDiscordAvatarUrl } from "../utils/discordUtils";
import { getTemperatureLabel, getDirectionArrow } from "../utils/gameUtils";

const formatKm = (km) => `${Number(km).toLocaleString()} km`;
const pluralGuesses = (n) => `${n} ${n === 1 ? "guess" : "guesses"}`;

const UserStatsModal = ({ user, isDiscord, onClose }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The game being viewed: { game, status: "loading" | "ready" | "error", guesses, answer }
  const [detail, setDetail] = useState(null);
  const fetchedRef = useRef(false);
  const scrollRef = useRef(null);
  const listScrollTop = useRef(0);
  const requestId = useRef(0);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `${API_BASE_URL}/api/user/${user?.id}/stats`;
      const response = isDiscord
        ? await fetch(`/api/user/${user?.id}/stats`)
        : await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch stats");
      }

      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, isDiscord]);

  useEffect(() => {
    if (user?.id && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchStats();
    }
  }, [fetchStats, user?.id]);

  const loadGame = useCallback(
    async (game) => {
      const id = ++requestId.current;
      setDetail({ game, status: "loading" });
      try {
        const date = String(game.date).slice(0, 10);
        const url = `${API_BASE_URL}/api/user/${user?.id}/guesses/${date}`;
        const response = isDiscord
          ? await fetch(`/api/user/${user?.id}/guesses/${date}`)
          : await fetch(url);

        if (!response.ok) {
          throw new Error("Failed to fetch guesses");
        }

        const data = await response.json();
        if (id !== requestId.current) return;
        setDetail({
          game,
          status: "ready",
          guesses: data.guesses || [],
          answer: data.answer,
        });
      } catch (err) {
        console.error("Failed to fetch guesses:", err);
        if (id !== requestId.current) return;
        setDetail({ game, status: "error" });
      }
    },
    [user, isDiscord]
  );

  const openGame = (game) => {
    listScrollTop.current = scrollRef.current?.scrollTop ?? 0;
    loadGame(game);
  };

  const closeGame = useCallback(() => {
    requestId.current++;
    setDetail(null);
  }, []);

  // Detail starts at the top; going back returns to where the list was
  const viewingGame = detail !== null;
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = viewingGame ? 0 : listScrollTop.current;
  }, [viewingGame]);

  // Escape backs out of a game first, then closes the modal
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (viewingGame) closeGame();
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewingGame, closeGame, onClose]);

  if (!user) {
    return null;
  }

  const avatarUrl = getDiscordAvatarUrl(user);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center px-4 bg-ink/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-float overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-2 flex items-center justify-between gap-2 shrink-0">
          {detail ? (
            <div className="flex items-center gap-1 min-w-0 -ml-2">
              <button
                onClick={closeGame}
                aria-label="Back to stats"
                className="text-ink-soft hover:text-ink hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors shrink-0"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h3 className="text-ink font-bold text-xl truncate">
                {formatDate(detail.game.date)}
              </h3>
            </div>
          ) : (
            <h3 className="text-ink font-bold text-xl">Your stats</h3>
          )}
          <button
            onClick={onClose}
            aria-label="Close stats"
            className="text-ink-faint hover:text-ink hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div ref={scrollRef} className="px-5 pb-5 pt-2 overflow-y-auto flex-1">
          {detail ? (
            <GameDetail detail={detail} onRetry={() => loadGame(detail.game)} />
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="motion-safe:animate-pulse text-ink-faint">
                Loading stats...
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-ink mb-2">Couldn&apos;t load your stats.</p>
              <button
                onClick={fetchStats}
                className="text-primary-600 font-semibold hover:underline"
              >
                Try again
              </button>
            </div>
          ) : stats ? (
            <div className="space-y-6">
              {/* User Profile */}
              <div className="flex items-center gap-3">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={user?.username}
                    className="w-12 h-12 rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <User className="w-6 h-6 text-ink-faint" />
                  </div>
                )}
                <div>
                  <h4 className="font-bold text-lg text-ink leading-tight">
                    {user?.username}
                  </h4>
                  <p className="text-sm text-ink-soft">
                    {stats.stats.gamesPlayed} games played
                  </p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <StatCard
                  label="Win rate"
                  value={`${stats.stats.winRate}%`}
                />
                <StatCard
                  label="Current streak"
                  value={stats.stats.currentStreak}
                />
                <StatCard
                  label="Avg. guesses"
                  value={stats.stats.avgGuesses || "-"}
                />
                <StatCard
                  label="Best game"
                  value={
                    stats.stats.bestGame
                      ? pluralGuesses(stats.stats.bestGame)
                      : "-"
                  }
                  small
                />
                <StatCard
                  label="Avg. distance"
                  value={
                    stats.stats.avgDistance
                      ? formatKm(stats.stats.avgDistance)
                      : "-"
                  }
                  small
                />
                <StatCard
                  label="Total guesses"
                  value={stats.stats.totalGuesses}
                />
              </div>

              {/* Recent Games */}
              {stats.recentGames && stats.recentGames.length > 0 && (
                <div>
                  <h4 className="font-bold text-ink mb-2">Recent games</h4>
                  <div className="divide-y divide-slate-100">
                    {stats.recentGames.map((game) => (
                      <button
                        key={game.date}
                        onClick={() => openGame(game)}
                        className="w-full flex items-center justify-between py-2.5 px-2 -mx-2 hover:bg-slate-50 rounded-lg transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              game.won ? "bg-heat-found" : "bg-heat-fire"
                            }`}
                          />
                          <div>
                            <p className="font-medium text-ink">
                              {formatDate(game.date)}
                            </p>
                            <p className="text-xs text-ink-soft tabular-nums">
                              {pluralGuesses(game.guessCount)} ·{" "}
                              {formatKm(game.distance)}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-ink-faint" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* No Games Yet */}
              {stats.stats.gamesPlayed === 0 && (
                <div className="text-center py-8 text-ink-soft">
                  <p className="font-semibold text-ink">No games yet</p>
                  <p className="text-sm">
                    Finish today&apos;s place to start your stats.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0">
          <button
            onClick={detail ? closeGame : onClose}
            className="w-full h-11 bg-slate-100 hover:bg-slate-200 text-ink font-semibold rounded-xl transition-colors"
          >
            {detail ? "Back to stats" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
};

const GameDetail = ({ detail, onRetry }) => {
  const { game, status, guesses, answer } = detail;

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="motion-safe:animate-pulse text-ink-faint">
          Loading guesses...
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="text-center py-12">
        <p className="text-ink mb-2">Couldn&apos;t load this game.</p>
        <button
          onClick={onRetry}
          className="text-primary-600 font-semibold hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Result summary */}
      <div
        className={`rounded-xl px-4 py-3 ${
          game.won ? "bg-green-50" : "bg-slate-50"
        }`}
      >
        <p className="font-bold text-ink">
          {game.won
            ? `Found in ${pluralGuesses(game.guessCount)}`
            : `Not found · ${pluralGuesses(game.guessCount)}`}
        </p>
        {answer?.name ? (
          <p className="text-sm text-ink-soft mt-0.5">
            The place was{" "}
            <span className="font-semibold text-ink">{answer.name}</span>
          </p>
        ) : (
          <p className="text-sm text-ink-soft mt-0.5 tabular-nums">
            Closest guess {formatKm(game.distance)} away
          </p>
        )}
      </div>

      {/* Guesses */}
      {guesses.length === 0 ? (
        <p className="text-center text-sm text-ink-soft py-6">
          No guesses were saved for this game.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {guesses.map((guess) => {
            const temp = getTemperatureLabel(guess.distance);
            const name =
              guess.location_name ||
              `${Number(guess.lat).toFixed(2)}, ${Number(guess.lng).toFixed(2)}`;
            const arrow = guess.distance >= 50 && getDirectionArrow(guess.direction);
            return (
              <li
                key={guess.guess_number}
                className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg text-sm"
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${temp.color}`}
                  title={temp.text}
                >
                  {guess.guess_number}
                </span>
                <span className="text-ink truncate flex-1 min-w-0" title={name}>
                  {name}
                </span>
                <span className="text-ink-soft font-medium tabular-nums shrink-0">
                  {guess.distance < 50 ? "Found it" : formatKm(guess.distance)}
                  {arrow && <span className="ml-1">{arrow}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

const StatCard = ({ label, value, small = false }) => (
  <div className="bg-slate-50 rounded-xl px-3 py-2.5">
    <p
      className={`font-extrabold text-ink tabular-nums leading-tight ${
        small ? "text-lg" : "text-2xl"
      }`}
    >
      {value}
    </p>
    <p className="text-xs text-ink-soft mt-0.5">{label}</p>
  </div>
);

export default UserStatsModal;
