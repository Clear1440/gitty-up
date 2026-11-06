/** Reads JSON from localStorage. Storage can be blocked or hold stale data. */
export function readStored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Losing this only means tabs and preferences are not restored next time.
  }
}
