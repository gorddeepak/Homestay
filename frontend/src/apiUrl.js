// In production, VITE_API_URL is the FastAPI origin, without a trailing slash
// or /api. Local development leaves it unset so Vite proxies /api and /images.
const configuredBaseUrl = (import.meta.env.VITE_API_URL || "").trim();

export const API_BASE_URL = configuredBaseUrl.replace(/\/+$/, "");

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}
