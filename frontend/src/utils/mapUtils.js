import { Icon } from "leaflet";

const svgIcon = (svg, size, anchor) =>
  new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: size,
    iconAnchor: anchor,
    popupAnchor: [0, -anchor[1]],
  });

// Guess pin, filled with the distance (heat) color
export function createNumberedMarkerIcon(number, color = "#172A36") {
  const fontSize = number > 99 ? 10 : 13;
  return svgIcon(
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
      <path fill="${color}" stroke="#FFF" stroke-width="2" d="M15 1C7.3 1 1 7.2 1 14.8c0 9.6 11.6 22.3 13.1 23.9.5.5 1.3.5 1.8 0C17.4 37.1 29 24.4 29 14.8 29 7.2 22.7 1 15 1z"/>
      <text x="15" y="19.5" font-size="${fontSize}" font-weight="700" text-anchor="middle" fill="#FFF" font-family="Schibsted Grotesk Variable, Arial, sans-serif">${number}</text>
    </svg>`,
    [30, 40],
    [15, 40]
  );
}

// Pending (unconfirmed) pick: hollow ink pin
export function createPendingMarkerIcon() {
  return svgIcon(
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
      <path fill="#FFF" stroke="#172A36" stroke-width="2.5" d="M15 1.5C7.5 1.5 1.5 7.5 1.5 14.8c0 9.4 11.4 21.9 12.9 23.5.3.3.9.3 1.2 0 1.5-1.6 12.9-14.1 12.9-23.5C28.5 7.5 22.5 1.5 15 1.5z"/>
      <circle cx="15" cy="15" r="4.5" fill="#172A36"/>
    </svg>`,
    [30, 40],
    [15, 40]
  );
}

// Answer: green flag on a pole
export function createAnswerMarkerIcon() {
  return svgIcon(
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
      <rect x="5" y="3" width="3" height="38" rx="1.5" fill="#172A36"/>
      <path d="M8 4h21l-5 7.5 5 7.5H8z" fill="#16A34A" stroke="#FFF" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="6.5" cy="40" r="2" fill="#172A36"/>
    </svg>`,
    [34, 42],
    [6, 41]
  );
}

export const tileProviders = [
  {
    name: "Esri WorldStreetMap",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
  {
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    name: "CartoDB Voyager",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  },
  {
    name: "CartoDB Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  },
];
