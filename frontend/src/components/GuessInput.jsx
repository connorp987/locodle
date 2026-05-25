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
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
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
    <div className="relative bg-white rounded-lg shadow-lg p-2 max-w-md mx-auto">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-gray-400" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || isSubmitting}
          placeholder="Search or click map..."
          className="block w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
      </div>

      {/* Suggestions dropdown — opens upward (input sits at screen bottom) */}
      {suggestions.length > 0 && (
        <div className="absolute left-2 right-2 bottom-full mb-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {suggestions.map((location, index) => (
            <button
              key={index}
              onClick={() => handleSelectLocation(location)}
              className="w-full text-left px-2 py-1.5 hover:bg-primary-50 flex items-start gap-1.5 border-b border-gray-100 last:border-b-0 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 text-primary-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">
                  {location.display_name}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Map-based guess confirmation */}
      {tempMarker && (
        <div className="mt-2 relative rounded-lg overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-400 rounded-lg animate-pulse"></div>
          <div className="relative p-2 flex justify-between items-center">
            <div className="flex items-center gap-1.5 text-green-800">
              <MapPin className="w-3.5 h-3.5 animate-bounce" />
              <p className="text-xs font-semibold">
                {tempMarker.lat.toFixed(3)}, {tempMarker.lng.toFixed(3)}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={handleConfirmMapGuess}
                disabled={isSubmitting}
                className={`py-2 px-3 rounded-lg transition-all font-bold text-sm shadow-lg transform disabled:cursor-not-allowed disabled:transform-none ${
                  isSubmitting
                    ? "bg-gray-400 text-gray-100 cursor-wait"
                    : "bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 hover:shadow-xl hover:scale-105"
                }`}
              >
                {isSubmitting ? "⏳ Submitting..." : "✓ Confirm"}
              </button>
              <button
                onClick={onClearMarker}
                disabled={isSubmitting}
                className="px-2 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuessInput;
