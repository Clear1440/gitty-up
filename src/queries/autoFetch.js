/**
 * Fetching from a remote can be slow, so it isn't repeated more than once a minute
 * without being asked for: going back to the repositories page fetches every
 * repository at most this often, and coming back to the app fetches the open
 * repository at most this often. Entering a repository's tab fetches it every time.
 */
export const FETCH_INTERVAL_MS = 60_000;

/**
 * Coming back to the window can fire both `focus` and `visibilitychange`, one straight
 * after the other, so a second return this soon after the first is the same return.
 */
export const RETURN_DEBOUNCE_MS = 1_000;

/** Whether fetching is due, given when it last ran (or null). */
export function isFetchDue(lastFetchedAt, now) {
  return lastFetchedAt === null || now - lastFetchedAt >= FETCH_INTERVAL_MS;
}

/** Whether coming back to the window should refresh, given when it last did (or null). */
export function isReturnRefreshDue(lastRefreshedAt, now) {
  return lastRefreshedAt === null || now - lastRefreshedAt >= RETURN_DEBOUNCE_MS;
}
