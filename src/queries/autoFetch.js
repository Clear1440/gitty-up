/**
 * Going back to the repositories page should not fetch every repository every time,
 * as that can be slow with many of them. A single repository fetches on every visit.
 */
export const FETCH_ALL_INTERVAL_MS = 60_000;

/** Whether fetching every repository is due, given when it last ran (or null). */
export function isFetchAllDue(lastFetchedAt, now) {
  return lastFetchedAt === null || now - lastFetchedAt >= FETCH_ALL_INTERVAL_MS;
}
