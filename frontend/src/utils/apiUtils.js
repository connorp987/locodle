// The backend serves the production build, so the API is same-origin there.
// In dev (vite on :3000) it's the backend on :3001. VITE_API_URL overrides.
const API_BASE_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");

export function createCustomFetch(isDiscord) {
  return async (url, options = {}) => {
    if (isDiscord) {
      const relativeUrl = url.replace(API_BASE_URL, "");
      return fetch(relativeUrl, options);
    } else {
      return fetch(url, options);
    }
  };
}

export function getApiUrl(endpoint, isDiscord = false) {
  if (isDiscord) {
    return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  }
  return `${API_BASE_URL}${
    endpoint.startsWith("/") ? endpoint : `/${endpoint}`
  }`;
}

export { API_BASE_URL };
