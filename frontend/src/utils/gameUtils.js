// hex mirrors the `heat` colors in tailwind.config.js (used for map pins)
export function getTemperatureLabel(distance) {
  if (distance < 50)
    return { text: "Found it", color: "text-white bg-heat-found", hex: "#16A34A" };
  if (distance < 500)
    return { text: "Fire", color: "text-white bg-heat-fire", hex: "#E0362C" };
  if (distance < 1500)
    return { text: "Hot", color: "text-white bg-heat-hot", hex: "#F2711C" };
  if (distance < 3000)
    return { text: "Warm", color: "text-ink bg-heat-warm", hex: "#E8A317" };
  if (distance < 6000)
    return { text: "Chilly", color: "text-white bg-heat-chilly", hex: "#4BA3D9" };
  if (distance < 10000)
    return { text: "Cold", color: "text-white bg-heat-cold", hex: "#2F6BC4" };
  return { text: "Freezing", color: "text-white bg-heat-freezing", hex: "#4B3FA8" };
}

export function getDirectionArrow(direction) {
  const arrows = {
    N: "⬆️",
    NE: "↗️",
    E: "➡️",
    SE: "↘️",
    S: "⬇️",
    SW: "↙️",
    W: "⬅️",
    NW: "↖️",
  };
  return arrows[direction] || "";
}

export function formatLocationName(guess) {
  if (guess.address) {
    const { city, town, village, hamlet, suburb, state, country } =
      guess.address;

    const mainName = city || town || village || hamlet || suburb;

    if (mainName) {
      const context = country || state;
      return context ? `${mainName}, ${context}` : mainName;
    }
  }

  const fullAddress = guess.guess;
  if (!fullAddress) return "";

  // Map-click guess whose place name hasn't loaded (or couldn't be found)
  if (/^-?\d+(\.\d+)?, -?\d+(\.\d+)?$/.test(fullAddress)) {
    return `${Number(guess.lat).toFixed(2)}, ${Number(guess.lng).toFixed(2)}`;
  }

  const parts = fullAddress.split(",").map((p) => p.trim());
  if (parts.length === 0) return fullAddress;

  const firstPart = parts[0];
  const isHouseNumber = /^[\d\-\s]+[a-zA-Z]?$/.test(firstPart);

  if (isHouseNumber && parts.length > 1) {
    return `${firstPart} ${parts[1]}`;
  }

  return firstPart;
}
