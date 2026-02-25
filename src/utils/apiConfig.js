/**
 * Runtime API configuration.
 *
 * Priority:
 * 1. localStorage  ("apiBaseUrl")
 * 2. VITE_API_BASE_URL  (build-time .env)
 * 3. empty string → client-side parsing only
 */

const STORAGE_KEY = 'apiBaseUrl';
const DEFAULT_URL = (import.meta.env.VITE_API_BASE_URL || '').trim();

export function getApiBaseUrl() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored.trim();   // "" is a valid override (means "no server")
  return DEFAULT_URL;
}

export function setApiBaseUrl(url) {
  localStorage.setItem(STORAGE_KEY, (url || '').trim());
}

export function clearApiBaseUrl() {
  localStorage.removeItem(STORAGE_KEY);
}

/** True when a base URL is configured (non-empty). */
export function hasApiBaseUrl() {
  return getApiBaseUrl().length > 0;
}
