import { useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMapEvents,
} from "react-leaflet";
import { Icon } from "leaflet";
import "leaflet/dist/leaflet.css";
import GuessHistoryOverlay from "./GuessHistoryOverlay";

// Fix for default marker icons in React-Leaflet
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
const MapClickHandler = ({ onMapClick, tempMarker, onConfirm }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });

  // Orange marker icon for preview
  const orangeIcon = new Icon({
    iconUrl:
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNSIgaGVpZ2h0PSI0MSIgdmlld0JveD0iMCAwIDI1IDQxIj48cGF0aCBmaWxsPSIjRkY4QzAwIiBkPSJNMTIuNSAwQzUuNiAwIDAgNS42IDAgMTIuNWMwIDEuNCAwLjIgMi43IDAuNyAzLjlsMTEuOCAyNC42IDExLjgtMjQuNmMwLjQtMS4yIDAuNy0yLjUgMC43LTMuOUMyNSA1LjYgMTkuNCAwIDEyLjUgMHoiLz48Y2lyY2xlIGZpbGw9IiNGRkYiIGN4PSIxMi41IiBjeT0iMTIuNSIgcj0iNyIvPjwvc3ZnPg==",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: markerShadow,
  });

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
            Click "Confirm Location" below
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
}) => {
  const center = [20, 0]; // Center of the world
  const zoom = 2;

  const convertDistance = (km) => {
    if (useKm) return km;
    return Math.round(km * 0.621371); // Convert to miles
  };

  const distanceUnit = useKm ? "km" : "mi";

  // Use local proxy if in Discord to avoid CSP issues
  const tileUrl = isDiscord
    ? "/api/tiles/{z}/{x}/{y}"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="h-full w-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
          url={tileUrl}
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
          const numberedIcon = new Icon({
            iconUrl: `data:image/svg+xml;base64,${btoa(`
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
              <path fill="#3B82F6" d="M16 0C7.2 0 0 7.2 0 16c0 1.8 0.3 3.5 0.9 5l15.1 23 15.1-23c0.6-1.5 0.9-3.2 0.9-5C32 7.2 24.8 0 16 0z"/>
              <circle fill="#FFF" cx="16" cy="16" r="11"/>
              <text x="16" y="22" font-size="14" font-weight="bold" text-anchor="middle" fill="#3B82F6" font-family="Arial, sans-serif">${guessNumber}</text>
            </svg>
          `)}`,
            iconSize: [32, 44],
            iconAnchor: [16, 44],
            popupAnchor: [0, -44],
          });

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
                    Distance: {convertDistance(guess.distance).toLocaleString()}{" "}
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
            icon={
              new Icon({
                iconUrl:
                  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNSIgaGVpZ2h0PSI0MSIgdmlld0JveD0iMCAwIDI1IDQxIj48cGF0aCBmaWxsPSIjRkZENzAwIiBkPSJNMTIuNSAwQzUuNiAwIDAgNS42IDAgMTIuNWMwIDEuNCAwLjIgMi43IDAuNyAzLjlsMTEuOCAyNC42IDExLjgtMjQuNmMwLjQtMS4yIDAuNy0yLjUgMC43LTMuOUMyNSA1LjYgMTkuNCAwIDEyLjUgMHoiLz48Y2lyY2xlIGZpbGw9IiNGRkYiIGN4PSIxMi41IiBjeT0iMTIuNSIgcj0iNyIvPjwvc3ZnPg==",
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
              })
            }
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
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1000]">
          <button
            onClick={() => onConfirm(tempMarker)}
            disabled={isSubmitting}
            className={`
              font-bold py-3 px-8 rounded-full shadow-xl transform transition-all flex items-center gap-2 text-lg border-2 border-white
              ${
                isSubmitting
                  ? "bg-gray-500 cursor-not-allowed opacity-80 scale-100"
                  : "bg-green-600 hover:bg-green-700 hover:scale-105 text-white"
              }
            `}
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin">⏳</span> Confirming...
              </>
            ) : (
              <>
                <span>📍</span> Confirm Location
              </>
            )}
          </button>
        </div>
      )}

      {/* Guess History Overlay */}
      <GuessHistoryOverlay guesses={guesses} useKm={useKm} gameMode={gameMode} />
    </div>
  );
};

export default GameMap;
