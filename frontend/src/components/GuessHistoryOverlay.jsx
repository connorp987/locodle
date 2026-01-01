import { useEffect, useRef } from "react";
import { TrendingDown, ChevronUp, ChevronDown, History } from "lucide-react";

const GuessHistoryOverlay = ({
  guesses,
  useKm = true,
  gameMode = "hard",
  isExpanded,
  onToggleExpand,
}) => {
  const scrollRef = useRef(null);

  // Scroll to top when new guesses are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [guesses]);

  const convertDistance = (km) => {
    if (useKm) return km;
    return Math.round(km * 0.621371); // Convert to miles
  };

  const distanceUnit = useKm ? "km" : "mi";

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
    if (guess.address) {
      const { city, town, village, hamlet, suburb, state, country } =
        guess.address;
      const mainName = city || town || village || hamlet || suburb;
      if (mainName) {
        const context = country || state;
        return context ? `${mainName}, ${context}` : mainName;
      }
    }

    const fullAddress = guess.guess;
    if (!fullAddress) return "";
    const parts = fullAddress.split(",").map((p) => p.trim());
    if (parts.length === 0) return fullAddress;

    const firstPart = parts[0];
    const isHouseNumber = /^[\d\-\s]+[a-zA-Z]?$/.test(firstPart);

    if (isHouseNumber && parts.length > 1) {
      return `${firstPart} ${parts[1]}`;
    }

    return firstPart;
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => onToggleExpand(true)}
        className="absolute top-4 right-4 z-[400] bg-white/90 backdrop-blur-md shadow-lg px-4 py-2 rounded-full flex items-center gap-2 text-sm font-bold text-gray-700 hover:bg-white transition-colors"
      >
        <History className="w-4 h-4" />
        <span className="hidden xs:inline">History</span>
        <span className="bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full text-xs">
          {guesses.length}
        </span>
        <ChevronDown className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="absolute top-4 right-4 w-[calc(100%-5rem)] md:w-80 z-[400] flex flex-col gap-2">
      {/* Minimize Button */}
      <button
        onClick={() => onToggleExpand(false)}
        className="absolute -top-3 -right-1 z-50 bg-white shadow-md border border-gray-100 p-1.5 rounded-full text-gray-600 hover:bg-gray-50"
      >
        <ChevronUp className="w-4 h-4" />
      </button>

      <div
        ref={scrollRef}
        className="flex flex-col gap-2 overflow-y-auto max-h-[168px] md:max-h-[256px] pr-1"
      >
        {[...guesses].reverse().map((guess, index) => {
          const temperature = getTemperatureLabel(guess.distance);
          // Calculate actual index for numbering (reverse)
          const actualIndex = guesses.length - index;

          return (
            <div
              key={index}
              className="border border-gray-200/50 rounded-lg p-3 shadow-sm bg-white/90 backdrop-blur-sm hover:bg-white transition-colors shrink-0"
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary-600 text-white text-xs font-bold flex-shrink-0">
                    {actualIndex}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-xs truncate">
                      {formatLocationName(guess)}
                    </p>
                    {guess.score !== undefined && (
                      <p className="text-xs font-bold text-primary-600">
                        {guess.score}
                      </p>
                    )}
                  </div>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap ml-2 ${temperature.color}`}
                >
                  {temperature.text}
                </span>
              </div>

              <div className="flex items-center gap-1 text-xs text-gray-600">
                <TrendingDown className="w-3 h-3" />
                <span>
                  {convertDistance(guess.distance).toLocaleString()}{" "}
                  {distanceUnit}
                </span>
                {guesses.length >= 2 &&
                  guess.direction &&
                  guess.distance >= 50 &&
                  gameMode === "easy" && (
                    <span
                      className="ml-1 font-bold text-gray-700"
                      title={`Direction: ${guess.direction}`}
                    >
                      {guess.direction} {getDirectionArrow(guess.direction)}
                    </span>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GuessHistoryOverlay;
