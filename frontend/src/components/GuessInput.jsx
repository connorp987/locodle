import { useState, useEffect, useRef } from "react";
import { Search, MapPin } from "lucide-react";

const GuessInput = ({
  onGuess,
  onConfirm,
  disabled,
  tempMarker,
  onClearMarker,
}) => {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef(null);

  const searchLocations = async (query) => {
    if (query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
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
    } finally {
      setLoading(false);
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
    if (value.length >= 2) {
      setLoading(true);
    } else {
      setLoading(false);
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
    onGuess({
      name: location.display_name,
      lat: parseFloat(location.lat),
      lng: parseFloat(location.lon),
    });
    setInput("");
    setSuggestions([]);
  };

  const handleConfirmMapGuess = () => {
    if (!tempMarker || !onConfirm) return;
    onConfirm(tempMarker);
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Enter your guess
        </label>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>

          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            disabled={disabled}
            placeholder="Search for a city, landmark, or country..."
            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {suggestions.map((location, index) => (
              <button
                key={index}
                onClick={() => handleSelectLocation(location)}
                className="w-full text-left px-4 py-3 hover:bg-primary-50 flex items-start gap-3 border-b border-gray-100 last:border-b-0 transition-colors"
              >
                <MapPin className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {location.display_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {location.type} • {location.lat.substring(0, 8)},{" "}
                    {location.lon.substring(0, 8)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {loading && <p className="mt-2 text-sm text-gray-500">Searching...</p>}
      </div>

      {/* Map-based guess confirmation */}
      {tempMarker && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-green-600" />
              <p className="text-sm font-medium text-green-800">
                Location selected on map
              </p>
            </div>
            <button
              onClick={onClearMarker}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
          <p className="text-xs text-gray-600 mb-3">
            Coordinates: {tempMarker.lat.toFixed(4)},{" "}
            {tempMarker.lng.toFixed(4)}
          </p>
          <button
            onClick={handleConfirmMapGuess}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            Confirm This Location
          </button>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-800">
          💡 <strong>Tip:</strong> Click anywhere on the map to place a pin, or
          search for a location by name!
        </p>
      </div>
    </div>
  );
};

export default GuessInput;
