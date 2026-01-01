import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Trophy,
  Target,
  Flame,
  TrendingUp,
  Calendar,
  MapPin,
  ChevronRight,
  User,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
      const url = `${API_BASE_URL}/api/user/${user.id}/stats`;
      const response = isDiscord
        ? await fetch(`/api/user/${user.id}/stats`)
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
        const url = `${API_BASE_URL}/api/user/${user.id}/guesses/${date}`;
        const response = isDiscord
          ? await fetch(`/api/user/${user.id}/guesses/${date}`)
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

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getAvatarUrl = () => {
    if (user?.avatar) {
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
    }
    return null;
  };

  if (!user) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-primary-600 px-6 py-4 flex items-center justify-between shrink-0">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Your Stats
          </h3>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-gray-500">
                Loading stats...
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500 mb-2">Failed to load stats</p>
              <button
                onClick={fetchStats}
                className="text-primary-600 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : stats ? (
            <div className="space-y-6">
              {/* User Profile */}
              <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                {getAvatarUrl() ? (
                  <img
                    src={getAvatarUrl()}
                    alt={user.username}
                    className="w-14 h-14 rounded-full"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="w-7 h-7 text-gray-400" />
                  </div>
                )}
                <div>
                  <h4 className="font-bold text-lg text-gray-900">
                    {user.username}
                  </h4>
                  <p className="text-sm text-gray-500">
                    {stats.stats.gamesPlayed} games played
                  </p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={<Trophy className="w-5 h-5 text-yellow-500" />}
                  label="Win Rate"
                  value={`${stats.stats.winRate}%`}
                />
                <StatCard
                  icon={<Flame className="w-5 h-5 text-orange-500" />}
                  label="Current Streak"
                  value={stats.stats.currentStreak}
                />
                <StatCard
                  icon={<Target className="w-5 h-5 text-green-500" />}
                  label="Avg Guesses"
                  value={stats.stats.avgGuesses || "-"}
                />
                <StatCard
                  icon={<TrendingUp className="w-5 h-5 text-blue-500" />}
                  label="Best Game"
                  value={
                    stats.stats.bestGame
                      ? `${stats.stats.bestGame} guesses`
                      : "-"
                  }
                  small
                />
                <StatCard
                  icon={<MapPin className="w-5 h-5 text-red-500" />}
                  label="Avg Distance"
                  value={
                    stats.stats.avgDistance
                      ? `${stats.stats.avgDistance} km`
                      : "-"
                  }
                  small
                />
                <StatCard
                  icon={<Target className="w-5 h-5 text-purple-500" />}
                  label="Total Guesses"
                  value={stats.stats.totalGuesses}
                />
              </div>

              {/* Recent Games */}
              {stats.recentGames && stats.recentGames.length > 0 && (
                <div>
                  <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Recent Games
                  </h4>
                  <div className="space-y-2">
                    {stats.recentGames.map((game) => (
                      <button
                        key={game.date}
                        onClick={() => fetchGameGuesses(game.date)}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              game.won ? "bg-green-500" : "bg-red-500"
                            }`}
                          />
                          <div>
                            <p className="font-medium text-gray-900">
                              {formatDate(game.date)}
                            </p>
                            <p className="text-xs text-gray-500">
                              {game.guessCount} guesses • {game.distance} km
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected Game Guesses */}
              {selectedGame && gameGuesses && (
                <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="font-bold text-gray-900">
                      Guesses for {formatDate(selectedGame)}
                    </h5>
                    <button
                      onClick={() => {
                        setSelectedGame(null);
                        setGameGuesses(null);
                      }}
                      className="text-gray-400 hover:text-gray-600"
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
                          <span className="text-gray-700 truncate max-w-[150px]">
                            {guess.location_name ||
                              `${guess.lat}, ${guess.lng}`}
                          </span>
                        </div>
                        <span className="text-gray-500 font-medium">
                          {guess.distance} km
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Games Yet */}
              {stats.stats.gamesPlayed === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No games played yet!</p>
                  <p className="text-sm">Start playing to track your stats.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, small = false }) => (
  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
    <div className="flex items-center gap-2 mb-1">
      {icon}
      <span className="text-xs text-gray-500 uppercase font-semibold">
        {label}
      </span>
    </div>
    <p className={`font-black text-gray-900 ${small ? "text-lg" : "text-2xl"}`}>
      {value}
    </p>
  </div>
);

export default UserStatsModal;
