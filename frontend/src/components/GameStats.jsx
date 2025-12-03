import { Target, TrendingUp, Award } from "lucide-react";

const GameStats = ({ guesses, maxGuesses, completed, won, useKm = true }) => {
  const convertDistance = (km) => {
    if (useKm) return km;
    return Math.round(km * 0.621371); // Convert to miles
  };

  const distanceUnit = useKm ? "km" : "mi";
  const bestGuess =
    guesses.length > 0 ? Math.min(...guesses.map((g) => g.distance)) : null;

  const averageDistance =
    guesses.length > 0
      ? Math.round(
          guesses.reduce((sum, g) => sum + g.distance, 0) / guesses.length
        )
      : null;

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Game Stats</h2>

      <div className="space-y-4">
        {/* Guesses Progress */}
        <div>
          <div className="bg-white rounded-xl shadow-lg p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">Total Guesses</p>
              <p className="text-2xl font-bold text-gray-900">{guesses.length}</p>
            </div>
            <div className="w-12 h-12 bg-primary-50 rounded-full flex items-center justify-center">
              <Target className="w-6 h-6 text-primary-600" />
            </div>
          </div>
        </div>

        {/* Best Guess */}
        {bestGuess !== null && (
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-700">
                Best Guess
              </span>
            </div>
            <span className="text-sm font-bold text-green-600">
              {convertDistance(bestGuess).toLocaleString()} {distanceUnit}
            </span>
          </div>
        )}

        {/* Average Distance */}
        {averageDistance !== null && (
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">
                Average Distance
              </span>
            </div>
            <span className="text-sm font-bold text-blue-600">
              {convertDistance(averageDistance).toLocaleString()} {distanceUnit}
            </span>
          </div>
        )}

        {/* Win Status */}
        {completed && (
          <div
            className={`flex items-center justify-between p-3 rounded-lg ${
              won ? "bg-yellow-50" : "bg-gray-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <Award
                className={`w-5 h-5 ${
                  won ? "text-yellow-600" : "text-gray-600"
                }`}
              />
              <span className="text-sm font-medium text-gray-700">Status</span>
            </div>
            <span
              className={`text-sm font-bold ${
                won ? "text-yellow-600" : "text-gray-600"
              }`}
            >
              {won ? "Victory! 🎉" : "Try again tomorrow"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameStats;
