import { useEffect, useRef } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { convertDistance, getDistanceUnit } from "../utils/distanceUtils";
import {
  getTemperatureLabel,
  getDirectionArrow,
  formatLocationName,
} from "../utils/gameUtils";

const GuessHistoryOverlay = ({
  guesses,
  useKm = true,
  gameMode = "hard",
  isExpanded,
  onToggleExpand,
}) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [guesses]);

  const distanceUnit = getDistanceUnit(useKm);

  // Nothing to show until the first guess
  if (!guesses || guesses.length === 0) {
    return null;
  }

  if (!isExpanded) {
    return (
      <button
        onClick={() => onToggleExpand(true)}
        aria-expanded={false}
        className="absolute top-3 right-3 z-[400] bg-white shadow-float h-9 pl-3 pr-2 rounded-full flex items-center gap-2 text-sm font-semibold text-ink hover:bg-slate-50 transition-colors"
      >
        Guesses
        <span className="bg-slate-100 text-ink px-2 py-0.5 rounded-full text-xs tabular-nums">
          {guesses.length}
        </span>
        <ChevronDown className="w-4 h-4 text-ink-faint" />
      </button>
    );
  }

  return (
    <div className="absolute top-2 right-2 sm:top-3 sm:right-3 w-48 sm:w-72 z-[400] bg-white/95 backdrop-blur rounded-xl sm:rounded-2xl shadow-float overflow-hidden">
      <button
        onClick={() => onToggleExpand(false)}
        aria-expanded={true}
        className="w-full flex items-center justify-between px-2.5 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm font-semibold text-ink hover:bg-slate-50 transition-colors"
      >
        <span>
          Guesses{" "}
          <span className="text-ink-faint font-medium tabular-nums">
            {guesses.length}
          </span>
        </span>
        <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-ink-faint" />
      </button>

      <ol
        ref={scrollRef}
        className="overflow-y-auto max-h-[92px] sm:max-h-[240px] border-t border-slate-100 divide-y divide-slate-100"
      >
        {[...guesses].reverse().map((guess, index) => {
          const temperature = getTemperatureLabel(guess.distance);
          const guessNumber = guesses.length - index;

          return (
            <li key={guessNumber} className="flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-1 sm:py-2">
              <span
                className={`flex items-center justify-center min-w-[1.25rem] h-5 sm:min-w-[1.5rem] sm:h-6 px-1 rounded-full text-[10px] sm:text-xs font-bold tabular-nums flex-shrink-0 ${temperature.color}`}
                title={temperature.text}
              >
                {guessNumber}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-medium text-ink truncate leading-tight">
                  {formatLocationName(guess)}
                </p>
                <p className="text-[10px] sm:text-xs text-ink-soft tabular-nums leading-tight">
                  {convertDistance(guess.distance, useKm).toLocaleString()}{" "}
                  {distanceUnit}
                  <span className="text-ink-faint"> · {temperature.text}</span>
                  {guess.direction &&
                    guess.distance >= 50 &&
                    gameMode === "easy" && (
                      <span
                        className="ml-1.5 font-semibold text-ink"
                        title={`Direction: ${guess.direction}`}
                      >
                        {guess.direction} {getDirectionArrow(guess.direction)}
                      </span>
                    )}
                </p>
              </div>
              {guess.score !== undefined && (
                <span
                  className="text-[11px] sm:text-sm font-semibold text-ink-soft sm:text-ink tabular-nums flex-shrink-0"
                  title="Proximity score (100 = on target)"
                >
                  {guess.score}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default GuessHistoryOverlay;
