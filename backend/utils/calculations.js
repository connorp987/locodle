function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

function toDeg(radians) {
  return radians * (180 / Math.PI);
}

export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

export function calculateBearing(lat1, lon1, lat2, lon2) {
  const startLat = toRad(lat1);
  const startLon = toRad(lon1);
  const destLat = toRad(lat2);
  const destLon = toRad(lon2);

  let dLon = destLon - startLon;

  const dPhi = Math.log(
    Math.tan(destLat / 2 + Math.PI / 4) / Math.tan(startLat / 2 + Math.PI / 4)
  );

  if (Math.abs(dLon) > Math.PI) {
    if (dLon > 0) {
      dLon = -(2 * Math.PI - dLon);
    } else {
      dLon = 2 * Math.PI + dLon;
    }
  }

  let brng = Math.atan2(dLon, dPhi);
  brng = toDeg(brng);
  return (brng + 360) % 360;
}

export function getCardinalDirection(angle) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(((angle %= 360) < 0 ? angle + 360 : angle) / 45) % 8;
  return directions[index];
}
