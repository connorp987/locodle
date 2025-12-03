import { MapPin, TrendingDown } from "lucide-react";

const GuessHistory = ({ guesses, useKm = true, gameMode = "hard" }) => {
  const convertDistance = (km) => {
    if (useKm) return km;
    return Math.round(km * 0.621371); // Convert to miles
  };

  const distanceUnit = useKm ? "km" : "mi";
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

  const getDistanceColor = (distance) => {
    if (distance < 50) return "text-green-600 bg-green-50"; // Found!
    if (distance < 500) return "text-red-600 bg-red-50"; // Hot
    if (distance < 1500) return "text-orange-600 bg-orange-50"; // Warm
    if (distance < 3000) return "text-yellow-600 bg-yellow-50"; // Cool
    return "text-blue-600 bg-blue-50"; // Cold
  };

  const getDistanceEmoji = (distance) => {
    if (distance < 50) return "🎯";
    if (distance < 500) return "🔥";
    if (distance < 1500) return "🥵";
    if (distance < 3000) return "😎";
    return "🥶";
  };

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

  const formatLocationName = (guess) => {
    // If we have structured address data from the backend, use it
    if (guess.address) {
      const { city, town, village, hamlet, suburb, county, state, country } = guess.address;
      
      // Try to find the most relevant "city-like" name
      const mainName = city || town || village || hamlet || suburb;
      
      if (mainName) {
        // Append state or country for context if available, but keep it short
        // e.g. "Paris, France" or "Springfield, IL"
        const context = country || state;
        return context ? `${mainName}, ${context}` : mainName;
      }
    }

    // Fallback to parsing the display_name string if no address object
    const fullAddress = guess.guess;
    if (!fullAddress) return "";
    const parts = fullAddress.split(",").map((p) => p.trim());
    if (parts.length === 0) return fullAddress;

    const firstPart = parts[0];
    // Check if first part is likely a house number (digits, optionally followed by a letter, e.g. "73", "73a", "10-12")
    const isHouseNumber = /^[\d\-\s]+[a-zA-Z]?$/.test(firstPart);

    if (isHouseNumber && parts.length > 1) {
      return `${firstPart} ${parts[1]}`;
    }

    return firstPart;
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <MapPin className="w-5 h-5 text-primary-600" />
        Guess History
      </h2>

      <div className="space-y-3">
        {[...guesses].reverse().map((guess, index) => (
          <div
            key={index}
            className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-bold">
                  {guesses.length - index}
                </span>
                <p className="font-medium text-gray-900 text-sm">
                  {formatLocationName(guess)}
                </p>
              </div>
              <span className="text-2xl">
                {getDistanceEmoji(guess.distance)}
              </span>
            </div>

            <div
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${getDistanceColor(
                guess.distance
              )}`}
            >
              <TrendingDown className="w-4 h-4" />
              {convertDistance(guess.distance).toLocaleString()} {distanceUnit}{" "}
              away
              {guesses.length >= 2 && guess.direction && guess.distance >= 50 && gameMode === "easy" && (
                <span className="ml-2 font-bold text-gray-700" title={`Direction: ${guess.direction}`}>
                  {guess.direction} {getDirectionArrow(guess.direction)}
                </span>
              )}
            </div>

            <p className="text-xs text-gray-500 mt-2">
              {new Date(guess.timestamp).toLocaleTimeString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GuessHistory;
