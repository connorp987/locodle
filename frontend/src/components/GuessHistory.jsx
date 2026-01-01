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

  const getTemperatureLabel = (distance) => {
    if (distance < 50)
      return { text: "Perfect!", color: "text-green-600 bg-green-50" };
    if (distance < 500)
      return { text: "Fire", color: "text-red-600 bg-red-50" };
    if (distance < 1500)
      return { text: "Hot", color: "text-orange-600 bg-orange-50" };
    if (distance < 3000)
      return { text: "Warm", color: "text-yellow-600 bg-yellow-50" };
    if (distance < 6000)
      return { text: "Chilly", color: "text-blue-400 bg-blue-50" };
    if (distance < 10000)
      return { text: "Cold", color: "text-blue-600 bg-blue-100" };
    return { text: "Freezing", color: "text-indigo-700 bg-indigo-100" };
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
      const { city, town, village, hamlet, suburb, state, country } =
        guess.address;

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
                  {convertDistance(guess.distance).toLocaleString()}{" "}
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
