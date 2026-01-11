import { useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMapEvents,
  ScaleControl,
} from "react-leaflet";
import { Icon } from "leaflet";
import "leaflet/dist/leaflet.css";
import GuessHistoryOverlay from "./GuessHistoryOverlay";
import { convertDistance, getDistanceUnit } from "../utils/distanceUtils";
import {
  createNumberedMarkerIcon,
  createOrangeMarkerIcon,
  createGoldMarkerIcon,
  tileProviders,
} from "../utils/mapUtils";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete Icon.Default.prototype._getIconUrl;
Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Component to handle map clicks
const MapClickHandler = ({ onMapClick, tempMarker }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });

  const orangeIcon = createOrangeMarkerIcon();

  return tempMarker ? (
    <Marker
      position={[tempMarker.lat, tempMarker.lng]}
      draggable={true}
      icon={orangeIcon}
      eventHandlers={{
        dragend(e) {
          const marker = e.target;
          const position = marker.getLatLng();
          onMapClick(position);
        },
      }}
    >
      <Popup>
        <div className="text-center p-2">
          <p className="font-bold text-orange-600">📍 Selected Location</p>
          <p className="text-xs text-gray-600 mt-1">
            Click &quot;Confirm Location&quot; below
          </p>
        </div>
      </Popup>
    </Marker>
  ) : null;
};

const GameMap = ({
  guesses,
  answer,
  onMapClick,
  tempMarker,
  onConfirm,
  isSubmitting,
  useKm = true,
  isDiscord = false,
  gameMode = "hard",
  isHistoryExpanded,
  onHistoryToggle,
}) => {
  const center = [20, 0];
  const zoom = 2;

  const [currentProviderIndex, setCurrentProviderIndex] = useState(0);
  const [tileKey, setTileKey] = useState(0);

  const distanceUnit = getDistanceUnit(useKm);

  // Handle tile loading errors by switching to next provider
  const handleTileError = () => {
    console.warn(
      `Tile provider ${tileProviders[currentProviderIndex].name} failed, trying fallback...`
    );

    const nextIndex = (currentProviderIndex + 1) % tileProviders.length;

    // Prevent infinite loop - if we've tried all providers, stop
    if (nextIndex !== 0 || currentProviderIndex === 0) {
      setCurrentProviderIndex(nextIndex);
      setTileKey((prev) => prev + 1); // Force TileLayer remount
    }
  };

  // Use local proxy if in Discord to avoid CSP issues, otherwise use current provider
  const currentProvider = tileProviders[currentProviderIndex];
  const tileUrl = isDiscord ? "/api/tiles/{z}/{x}/{y}" : currentProvider.url;
  const attribution = isDiscord
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    : currentProvider.attribution;

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="h-full w-full z-0"
      >
        <TileLayer
          key={tileKey}
          attribution={attribution}
          url={tileUrl}
          eventHandlers={{
            tileerror: handleTileError,
          }}
        />
        <ScaleControl
          key={`scale-${useKm}`}
          position="topleft"
          metric={useKm}
          imperial={!useKm}
          maxWidth={250}
        />

        {/* Handle map clicks and show temp marker */}
        {onMapClick && (
          <MapClickHandler
            onMapClick={onMapClick}
            tempMarker={tempMarker}
            onConfirm={onConfirm}
          />
        )}

        {/* Render guess markers with numbers */}
        {guesses.map((guess, index) => {
          const guessNumber = index + 1;
          const numberedIcon = createNumberedMarkerIcon(guessNumber);

          return (
            <Marker
              key={index}
              position={[guess.lat, guess.lng]}
              icon={numberedIcon}
            >
              <Popup>
                <div className="text-center">
                  <p className="font-bold">{guess.guess}</p>
                  <p className="text-sm text-gray-600">Guess #{guessNumber}</p>
                  <p className="text-sm">
                    Distance:{" "}
                    {convertDistance(guess.distance, useKm).toLocaleString()}{" "}
                    {distanceUnit}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Show answer marker when game is complete */}
        {answer && (
          <Marker
            position={[answer.lat, answer.lng]}
            icon={createGoldMarkerIcon()}
          >
            <Popup>
              <div className="text-center">
                <p className="font-bold text-green-600">✓ Correct Answer</p>
                <p className="font-semibold">{answer.name}</p>
                <p className="text-sm text-gray-600">{answer.country}</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Draw lines from guesses to answer */}
        {answer &&
          guesses.map((guess, index) => (
            <Polyline
              key={`line-${index}`}
              positions={[
                [guess.lat, guess.lng],
                [answer.lat, answer.lng],
              ]}
              pathOptions={{
                color: "blue",
                weight: 2,
                opacity: 0.5,
                dashArray: "5, 10",
              }}
            />
          ))}
      </MapContainer>

      {/* Floating Confirm Button */}
      {tempMarker && onConfirm && (
        <div className="confirm-button-container absolute left-1/2 transform -translate-x-1/2 z-[1000]">
          <button
            onClick={() => onConfirm(tempMarker)}
            disabled={isSubmitting}
            className={`
              font-bold rounded-full shadow-xl transform transition-all flex items-center gap-2 border-2 border-white backdrop-blur-sm
              ${
                isSubmitting
                  ? "bg-gray-500/90 cursor-not-allowed opacity-80"
                  : "bg-green-600/90 hover:bg-green-700 hover:scale-105 text-white"
              }
            `}
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin text-sm sm:text-base">⏳</span>
                <span>Confirming...</span>
              </>
            ) : (
              <>
                <span className="text-sm sm:text-base">📍</span>
                <span>Confirm Location</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Guess History Overlay */}
      <GuessHistoryOverlay
        guesses={guesses}
        useKm={useKm}
        gameMode={gameMode}
        isExpanded={isHistoryExpanded}
        onToggleExpand={onHistoryToggle}
      />
    </div>
  );
};

export default GameMap;
