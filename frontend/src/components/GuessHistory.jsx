import { MapPin, TrendingDown } from "lucide-react";
import { convertDistance, getDistanceUnit } from "../utils/distanceUtils";
import {
  getTemperatureLabel,
  getDirectionArrow,
  formatLocationName,
} from "../utils/gameUtils";

const GuessHistory = ({ guesses, useKm = true, gameMode = "hard" }) => {
  const distanceUnit = getDistanceUnit(useKm);
  if (guesses.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary-600" />
          Guess History
        </h2>
        <p className="text-gray-500 text-center py-8">
          No guesses yet. Start guessing!
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <MapPin className="w-5 h-5 text-primary-600" />
        Guess History
      </h2>

      <div className="space-y-3">
        {[...guesses].reverse().map((guess, index) => {
          const temperature = getTemperatureLabel(guess.distance);

          return (
            <div
              key={index}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-bold">
                    {guesses.length - index}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {formatLocationName(guess)}
                    </p>
                    {guess.score !== undefined && (
                      <p className="text-xs font-bold text-primary-600">
                        Score: {guess.score}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded ${temperature.color}`}
                  >
                    {temperature.text}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600">
                <TrendingDown className="w-4 h-4" />
                <span>
                  {convertDistance(guess.distance, useKm).toLocaleString()}{" "}
                  {distanceUnit} away
                </span>
                {guesses.length >= 2 &&
                  guess.direction &&
                  guess.distance >= 50 &&
                  gameMode === "easy" && (
                    <span
                      className="ml-2 font-bold text-gray-700"
                      title={`Direction: ${guess.direction}`}
                    >
                      {guess.direction} {getDirectionArrow(guess.direction)}
                    </span>
                  )}
              </div>

              <p className="text-xs text-gray-500 mt-2">
                {new Date(guess.timestamp).toLocaleTimeString()}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GuessHistory;
