const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
