export function getTemperatureLabel(distance) {
  if (distance < 50)
    return { text: "Perfect!", color: "text-green-600 bg-green-50" };
  if (distance < 500) return { text: "Fire", color: "text-red-600 bg-red-50" };
  if (distance < 1500)
    return { text: "Hot", color: "text-orange-600 bg-orange-50" };
  if (distance < 3000)
    return { text: "Warm", color: "text-yellow-600 bg-yellow-50" };
  if (distance < 6000)
    return { text: "Chilly", color: "text-blue-400 bg-blue-50" };
  if (distance < 10000)
    return { text: "Cold", color: "text-blue-600 bg-blue-100" };
  return { text: "Freezing", color: "text-indigo-700 bg-indigo-100" };
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
  const parts = fullAddress.split(",").map((p) => p.trim());
  if (parts.length === 0) return fullAddress;

  const firstPart = parts[0];
  const isHouseNumber = /^[\d\-\s]+[a-zA-Z]?$/.test(firstPart);

  if (isHouseNumber && parts.length > 1) {
    return `${firstPart} ${parts[1]}`;
  }

  return firstPart;
}
