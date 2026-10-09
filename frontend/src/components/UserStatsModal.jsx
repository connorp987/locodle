import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronRight, User } from "lucide-react";
import { API_BASE_URL } from "../utils/apiUtils";
import { formatDate } from "../utils/dateUtils";
import { getDiscordAvatarUrl } from "../utils/discordUtils";

const UserStatsModal = ({ user, isDiscord, onClose }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameGuesses, setGameGuesses] = useState(null);
  const fetchedRef = useRef(false);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
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

  const fetchGameGuesses = useCallback(
    async (date) => {
      try {
        const url = `${API_BASE_URL}/api/user/${user?.id}/guesses/${date}`;
        const response = isDiscord
          ? await fetch(`/api/user/${user?.id}/guesses/${date}`)
          : await fetch(url);

        if (!response.ok) {
          throw new Error("Failed to fetch guesses");
        }

        const data = await response.json();
        setGameGuesses(data.guesses);
        setSelectedGame(date);
      } catch (err) {
        console.error("Failed to fetch guesses:", err);
      }
    },
    [user, isDiscord]
  );

  const getAvatarUrl = () => {
    return getDiscordAvatarUrl(user);
  };

  if (!user) {
    return null;
  }

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
        <div className="px-5 pt-5 pb-2 flex items-center justify-between shrink-0">
          <h3 className="text-ink font-bold text-xl">Your stats</h3>
          <button
            onClick={onClose}
            aria-label="Close stats"
            className="text-ink-faint hover:text-ink hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-5 pt-2 overflow-y-auto flex-1">
          {loading ? (
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
                {getAvatarUrl() ? (
                  <img
                    src={getAvatarUrl()}
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
                      ? `${stats.stats.bestGame} guesses`
                      : "-"
                  }
                  small
                />
                <StatCard
                  label="Avg. distance"
                  value={
                    stats.stats.avgDistance
                      ? `${stats.stats.avgDistance} km`
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
                  <h4 className="font-bold text-ink mb-2">
                    Recent games
                  </h4>
                  <div className="divide-y divide-slate-100">
                    {stats.recentGames.map((game) => (
                      <button
                        key={game.date}
                        onClick={() => fetchGameGuesses(game.date)}
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
                              {game.guessCount} guesses, {game.distance} km
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-ink-faint" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected Game Guesses */}
              {selectedGame && gameGuesses && (
                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="font-bold text-ink">
                      Guesses for {formatDate(selectedGame)}
                    </h5>
                    <button
                      onClick={() => {
                        setSelectedGame(null);
                        setGameGuesses(null);
                      }}
                      className="text-ink-faint hover:text-ink"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {gameGuesses.map((guess, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-white rounded-lg text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold">
                            {guess.guess_number}
                          </span>
                          <span className="text-ink truncate max-w-[180px]">
                            {guess.location_name ||
                              `${guess.lat}, ${guess.lng}`}
                          </span>
                        </div>
                        <span className="text-ink-soft font-medium tabular-nums">
                          {guess.distance} km
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Games Yet */}
              {stats.stats.gamesPlayed === 0 && (
                <div className="text-center py-8 text-ink-soft">
                  <p className="font-semibold text-ink">No games yet</p>
                  <p className="text-sm">Finish today&apos;s place to start your stats.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0">
          <button
            onClick={onClose}
            className="w-full h-11 bg-slate-100 hover:bg-slate-200 text-ink font-semibold rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
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
