const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Each unit relative times can be given in, largest first, with its length in seconds. */
const UNITS = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** Dates and times, as shown to the user in their own locale. */
export class TimeHelper {
  /** How long ago or ahead a date is, as in "3 days ago", or "just now" within a minute. */
  static formatRelative(date, now = Date.now()) {
    const seconds = Math.round((new Date(date).getTime() - now) / 1000);
    for (const [unit, unitSeconds] of UNITS) {
      if (Math.abs(seconds) >= unitSeconds) {
        return relativeFormat.format(Math.round(seconds / unitSeconds), unit);
      }
    }
    return 'just now';
  }

  /** The date and time in full, as in "Mar 4, 2026, 3:15 PM". */
  static formatFull(date) {
    return fullFormat.format(new Date(date));
  }

  /** Milliseconds since 1970, or 0 for a date that is missing or can't be read. */
  static toTimestamp(date) {
    return Date.parse(date) || 0;
  }
}
