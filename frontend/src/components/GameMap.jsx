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
  createPendingMarkerIcon,
  createAnswerMarkerIcon,
  tileProviders,
} from "../utils/mapUtils";
import { getTemperatureLabel, formatLocationName } from "../utils/gameUtils";

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

  const pendingIcon = createPendingMarkerIcon();

  return tempMarker ? (
    <Marker
      position={[tempMarker.lat, tempMarker.lng]}
      draggable={true}
      icon={pendingIcon}
      eventHandlers={{
        dragend(e) {
          const marker = e.target;
          const position = marker.getLatLng();
          onMapClick(position);
        },
      }}
    />
  ) : null;
};

const GameMap = ({
  guesses,
  answer,
  onMapClick,
  tempMarker,
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
          />
        )}

        {/* Render guess markers with numbers */}
        {guesses.map((guess, index) => {
          const guessNumber = index + 1;
          const numberedIcon = createNumberedMarkerIcon(
            guessNumber,
            getTemperatureLabel(guess.distance).hex
          );

          return (
            <Marker
              key={index}
              position={[guess.lat, guess.lng]}
              icon={numberedIcon}
            >
              <Popup>
                <div className="min-w-[140px]">
                  <p className="text-xs text-ink-faint">Guess {guessNumber}</p>
                  <p className="font-semibold text-ink leading-snug">
                    {formatLocationName(guess)}
                  </p>
                  <p className="text-sm text-ink-soft tabular-nums mt-0.5">
                    {convertDistance(guess.distance, useKm).toLocaleString()}{" "}
                    {distanceUnit} away
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
            icon={createAnswerMarkerIcon()}
            zIndexOffset={1000}
          >
            <Popup>
              <div className="min-w-[140px]">
                <p className="text-xs font-semibold text-heat-found">
                  The answer
                </p>
                <p className="font-semibold text-ink leading-snug">
                  {answer.name}
                </p>
                <p className="text-sm text-ink-soft">{answer.country}</p>
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
                color: getTemperatureLabel(guess.distance).hex,
                weight: 2,
                opacity: 0.7,
                dashArray: "2, 6",
                lineCap: "round",
              }}
            />
          ))}
      </MapContainer>

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
