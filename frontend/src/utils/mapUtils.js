import { Icon } from "leaflet";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

export function createNumberedMarkerIcon(number) {
  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
        <path fill="#3B82F6" d="M16 0C7.2 0 0 7.2 0 16c0 1.8 0.3 3.5 0.9 5l15.1 23 15.1-23c0.6-1.5 0.9-3.2 0.9-5C32 7.2 24.8 0 16 0z"/>
        <circle fill="#FFF" cx="16" cy="16" r="11"/>
        <text x="16" y="22" font-size="14" font-weight="bold" text-anchor="middle" fill="#3B82F6" font-family="Arial, sans-serif">${number}</text>
      </svg>
    `)}`,
    iconSize: [32, 44],
    iconAnchor: [16, 44],
    popupAnchor: [0, -44],
  });
}

export function createOrangeMarkerIcon() {
  return new Icon({
    iconUrl:
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNSIgaGVpZ2h0PSI0MSIgdmlld0JveD0iMCAwIDI1IDQxIj48cGF0aCBmaWxsPSIjRkY4QzAwIiBkPSJNMTIuNSAwQzUuNiAwIDAgNS42IDAgMTIuNWMwIDEuNCAwLjIgMi43IDAuNyAzLjlsMTEuOCAyNC42IDExLjgtMjQuNmMwLjQtMS4yIDAuNy0yLjUgMC43LTMuOUMyNSA1LjYgMTkuNCAwIDEyLjUgMHoiLz48Y2lyY2xlIGZpbGw9IiNGRkYiIGN4PSIxMi41IiBjeT0iMTIuNSIgcj0iNyIvPjwvc3ZnPg==",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: markerShadow,
  });
}

export function createGoldMarkerIcon() {
  return new Icon({
    iconUrl:
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNSIgaGVpZ2h0PSI0MSIgdmlld0JveD0iMCAwIDI1IDQxIj48cGF0aCBmaWxsPSIjRkZENzAwIiBkPSJNMTIuNSAwQzUuNiAwIDAgNS42IDAgMTIuNWMwIDEuNCAwLjIgMi43IDAuNyAzLjlsMTEuOCAyNC42IDExLjgtMjQuNmMwLjQtMS4yIDAuNy0yLjUgMC43LTMuOUMyNSA1LjYgMTkuNCAwIDEyLjUgMHoiLz48Y2lyY2xlIGZpbGw9IiNGRkYiIGN4PSIxMi41IiBjeT0iMTIuNSIgcj0iNyIvPjwvc3ZnPg==",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
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
