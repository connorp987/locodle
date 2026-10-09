async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Locodle/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// Cache lookups (including in-flight ones) so the guess route and the
// client's follow-up /api/geocode call share one upstream request.
const GEOCODE_CACHE_MAX = 500;
const geocodeCache = new Map();

const cacheKey = (lat, lng) =>
  `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;

export function geocodeLocation(lat, lng) {
  const key = cacheKey(lat, lng);
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const promise = fetchGeocode(lat, lng).then((result) => {
    // Don't keep failures around; a later call may succeed
    if (!result) geocodeCache.delete(key);
    return result;
  });

  geocodeCache.set(key, promise);
  if (geocodeCache.size > GEOCODE_CACHE_MAX) {
    geocodeCache.delete(geocodeCache.keys().next().value);
  }
  return promise;
}

async function fetchGeocode(lat, lng) {
  try {
    const data = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
      1500
    );
    return {
      name: data.display_name,
      address: data.address,
    };
  } catch (err) {
    console.log("Nominatim failed/timed out, trying backup...");
  }

  try {
    const data = await fetchWithTimeout(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      5000
    );
    const parts = [
      data.locality,
      data.city,
      data.principalSubdivision,
      data.countryName,
    ].filter(Boolean);

    return {
      name: parts.join(", "),
      address: {
        city: data.city || data.locality,
        state: data.principalSubdivision,
        country: data.countryName,
        country_code: data.countryCode?.toLowerCase(),
      },
    };
  } catch (err) {
    console.error("All geocoding providers failed:", err);
    return null;
  }
}
