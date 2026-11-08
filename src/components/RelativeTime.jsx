import { TimeHelper } from '../utils/TimeHelper.js';

export function RelativeTime({ date, className }) {
  return (
    <time className={className} dateTime={date} title={TimeHelper.formatFull(date)}>
      {TimeHelper.formatRelative(date)}
    </time>
  );
}
