export function convertDistance(km, useKm = true) {
  if (useKm) return km;
  return Math.round(km * 0.621371);
}

export function getDistanceUnit(useKm = true) {
  return useKm ? "km" : "mi";
}
