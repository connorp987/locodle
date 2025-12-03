import React from "react";
import { X, MapPin, Navigation } from "lucide-react";

const GuessResultModal = ({ guess, isHotter, onClose, useKm, gameMode = "hard" }) => {
  if (!guess) return null;

  const distanceUnit = useKm ? "km" : "mi";
  const distance = useKm
    ? Math.round(guess.distance)
    : Math.round(guess.distance * 0.621371);

  // Helper to get temperature label
  const getTemperatureLabel = (distance) => {
    if (distance < 50) return { text: "Perfect!", color: "bg-green-500" };
    if (distance < 500) return { text: "Fire", color: "bg-red-500" };
    if (distance < 1500) return { text: "Hot", color: "bg-orange-500" };
    if (distance < 3000) return { text: "Warm", color: "bg-yellow-500" };
    if (distance < 6000) return { text: "Chilly", color: "bg-blue-400" };
    if (distance < 10000) return { text: "Cold", color: "bg-blue-600" };
    return { text: "Freezing", color: "bg-indigo-700" };
  };

  // Helper to get arrow emoji
  const getDirectionArrow = (direction) => {
    const arrows = {
      N: "⬆️",
      NE: "↗️",
      E: "➡️",
      SE: "↘️",
      S: "⬇️",
      SW: "↙️",
      W: "⬅️",
      NW: "↖️",
    };
    return arrows[direction] || "";
  };

  // Helper to format location name (reusing logic from GuessHistory if possible, or duplicating for now for simplicity)
  const formatLocationName = (guess) => {
    if (guess.address) {
      const { city, town, village, hamlet, suburb, country, state } =
        guess.address;
      const mainName = city || town || village || hamlet || suburb;
      if (mainName) {
        const context = country || state;
        return context ? `${mainName}, ${context}` : mainName;
      }
    }
    // Fallback
    const fullAddress = guess.guess;
    const parts = fullAddress.split(",");
    const firstPart = parts[0].trim();
    if (!isNaN(firstPart.charAt(0)) && parts.length > 1) {
      return `${firstPart} ${parts[1].trim()}`;
    }
    return firstPart;
  };

  const temperature = getTemperatureLabel(guess.distance);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-primary-600 px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Guess Result
          </h3>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 text-center space-y-6">
          {/* Location Name */}
          <div>
            <p className="text-sm text-gray-500 uppercase tracking-wide font-semibold mb-1">
              You Guessed
            </p>
            <p className="text-xl font-bold text-gray-900 leading-tight">
              {formatLocationName(guess)}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-xs text-gray-500 uppercase font-bold mb-1">
                Distance
              </p>
              <p className="text-2xl font-black text-primary-600">
                {distance.toLocaleString()}
                <span className="text-sm font-medium text-gray-400 ml-1">
                  {distanceUnit}
                </span>
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-xs text-gray-500 uppercase font-bold mb-1">
                Score
              </p>
              <p className="text-2xl font-black text-primary-600">
                {guess.score !== undefined ? guess.score : "?"}
              </p>
            </div>
          </div>

          {/* Temperature Banner */}
          <div className={`rounded-xl p-4 font-bold text-white flex items-center justify-center ${temperature.color}`}>
            {temperature.text}
          </div>

          {/* Direction Hint (Easy Mode) */}
          {gameMode === "easy" && guess.direction && (
            <div className="bg-yellow-50 rounded-xl p-3 border border-yellow-100 text-yellow-800 font-medium flex items-center justify-center gap-2">
              <span>Target is to the {guess.direction}</span>
              <span className="text-xl">{getDirectionArrow(guess.direction)}</span>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={onClose}
            className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-lg shadow-primary-600/20 transition-all transform active:scale-95 flex items-center justify-center gap-2"
          >
            <Navigation className="w-5 h-5" />
            Next Guess
          </button>
        </div>
      </div>
    </div>
  );
};

export default GuessResultModal;
