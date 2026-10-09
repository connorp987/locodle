import { useState, useEffect, useRef } from "react";
import { Search, MapPin } from "lucide-react";

const GuessInput = ({
  onGuess,
  onConfirm,
  disabled,
  tempMarker,
  onClearMarker,
  isSubmitting,
}) => {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const debounceTimer = useRef(null);
  const inputRef = useRef(null);
  const wasTypingRef = useRef(false);

  const searchLocations = async (query) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      // Using Nominatim API for geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(
          query
        )}&limit=5`
      );
      const data = await response.json();
      setSuggestions(data);
    } catch (error) {
      console.error("Failed to search locations:", error);
      setSuggestions([]);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);

    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Set loading state immediately if there's text
    if (value.length <= 2) {
      setSuggestions([]);
    }

    // Debounce the search with 500ms delay
    debounceTimer.current = setTimeout(() => {
      searchLocations(value);
    }, 500);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  const handleSelectLocation = (location) => {
    wasTypingRef.current = true; // Mark that this was from typing/search
    onGuess({
      name: location.display_name,
      lat: parseFloat(location.lat),
      lng: parseFloat(location.lon),
      address: location.address,
    });
    setInput("");
    setSuggestions([]);
  };

  // Enter submits the top suggestion
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && suggestions.length > 0 && !isSubmitting) {
      e.preventDefault();
      handleSelectLocation(suggestions[0]);
    }
  };

  // Focus and select input after submission completes (only if user was typing)
  useEffect(() => {
    if (
      !isSubmitting &&
      inputRef.current &&
      input === "" &&
      wasTypingRef.current
    ) {
      // Wait a bit for the submission to fully complete
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
        wasTypingRef.current = false; // Reset the flag
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isSubmitting, input]);

  const handleConfirmMapGuess = () => {
    if (!tempMarker || !onConfirm) return;
    wasTypingRef.current = false; // Mark that this was NOT from typing
    onConfirm(tempMarker);
  };

  return (
    <div className="relative bg-white rounded-2xl shadow-float p-1.5 max-w-lg mx-auto">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-ink-faint" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || isSubmitting}
          placeholder="Search a place, or tap the map"
          aria-label="Search for a place to guess"
          className="block w-full h-11 pl-10 pr-3 text-base text-ink placeholder:text-ink-faint bg-slate-50 rounded-xl border border-transparent focus:outline-none focus:bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        />
      </div>

      {/* Suggestions dropdown — opens upward (input sits at screen bottom) */}
      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 bottom-full mb-2 bg-white rounded-xl shadow-float max-h-56 overflow-y-auto py-1">
          {suggestions.map((location, index) => (
            <button
              key={index}
              onClick={() => handleSelectLocation(location)}
              className={`w-full text-left px-3 py-2 hover:bg-primary-50 flex items-start gap-2 transition-colors ${
                index === 0 ? "bg-slate-50" : ""
              }`}
            >
              <MapPin className="w-4 h-4 text-primary-600 flex-shrink-0 mt-0.5" />
              <p className="flex-1 min-w-0 text-sm text-ink truncate">
                {location.display_name}
              </p>
              {index === 0 && (
                <kbd className="hidden sm:inline text-[11px] text-ink-faint border border-slate-200 rounded px-1.5 py-0.5 flex-shrink-0">
                  Enter
                </kbd>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Map-based guess confirmation */}
      {tempMarker && (
        <div className="mt-1.5 flex items-center gap-2 pl-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink">Pin dropped</p>
            <p className="text-xs text-ink-soft tabular-nums">
              {tempMarker.lat.toFixed(3)}, {tempMarker.lng.toFixed(3)}
            </p>
          </div>
          <button
            onClick={onClearMarker}
            disabled={isSubmitting}
            className="h-10 px-3 text-sm font-medium text-ink-soft hover:text-ink hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
          >
            Clear
          </button>
          <button
            onClick={handleConfirmMapGuess}
            disabled={isSubmitting}
            className="h-10 px-4 rounded-xl text-sm font-semibold text-white bg-ink hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {isSubmitting ? "Guessing…" : "Guess here"}
          </button>
        </div>
      )}
    </div>
  );
};

export default GuessInput;
