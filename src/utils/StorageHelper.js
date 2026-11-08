/**
 * Reads and writes JSON in localStorage. Storage can be blocked or hold stale data, so
 * reads fall back and writes fail quietly: losing a value only means a preference or an
 * open tab is not restored next time.
 */
export class StorageHelper {
  static read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  static write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // See above: nothing is lost but the remembering.
    }
  }
}
