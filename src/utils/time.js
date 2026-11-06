const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const UNITS = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

export function formatRelativeTime(date, now = Date.now()) {
  const seconds = Math.round((new Date(date).getTime() - now) / 1000);
  for (const [unit, unitSeconds] of UNITS) {
    if (Math.abs(seconds) >= unitSeconds) {
      return relativeFormat.format(Math.round(seconds / unitSeconds), unit);
    }
  }
  return 'just now';
}

export function formatFullTime(date) {
  return fullFormat.format(new Date(date));
}
