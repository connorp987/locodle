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

export async function geocodeLocation(lat, lng) {
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
