import React from "react";
import { X, MapPin, Navigation } from "lucide-react";

const GuessResultModal = ({ guess, onClose, useKm }) => {
  if (!guess) return null;

  const distanceUnit = useKm ? "km" : "mi";
  const distance = useKm
    ? Math.round(guess.distance)
    : Math.round(guess.distance * 0.621371);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 md:hidden">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
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
                Direction
              </p>
              <div className="flex items-center justify-center gap-2">
                <p className="text-2xl font-black text-primary-600">
                  {guess.direction || "?"}
                </p>
                <span className="text-2xl">
                  {getDirectionArrow(guess.direction)}
                </span>
              </div>
            </div>
          </div>

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
