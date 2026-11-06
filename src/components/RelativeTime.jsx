import { formatFullTime, formatRelativeTime } from '../utils/time.js';

export function RelativeTime({ date, className }) {
  return (
    <time className={className} dateTime={date} title={formatFullTime(date)}>
      {formatRelativeTime(date)}
    </time>
  );
}
