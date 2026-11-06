import { readPixels } from '../../../styles/readToken.js';

const ROW_HEIGHT = readPixels('--size-commit-row');
const COLUMN_WIDTH = readPixels('--size-graph-column');
const ROW_MIDDLE = ROW_HEIGHT / 2;
const MAX_VISIBLE_COLUMNS = 14;
const NODE_RADIUS = 4.5;
const LINE_WIDTH = 2;

const graphColor = (color) => `var(--color-graph-${color + 1})`;
const columnX = (column) => COLUMN_WIDTH * column + COLUMN_WIDTH / 2;

function segmentPath({ kind, from, to }) {
  const startX = columnX(from);
  const endX = columnX(to);
  const startY = kind === 'bottom' ? ROW_MIDDLE : 0;
  const endY = kind === 'top' ? ROW_MIDDLE : ROW_HEIGHT;
  if (startX === endX) return `M${startX} ${startY}V${endY}`;

  const bendY = (startY + endY) / 2;
  return `M${startX} ${startY}C${startX} ${bendY} ${endX} ${bendY} ${endX} ${endY}`;
}

/** The slice of the git tree beside one commit. Rows line up to form the whole tree. */
export function CommitGraphCell({ row, columnCount, isHead, isMerge }) {
  const width = Math.min(columnCount, MAX_VISIBLE_COLUMNS) * COLUMN_WIDTH;
  const nodeColor = graphColor(row.color);

  return (
    <svg width={width} height={ROW_HEIGHT} aria-hidden style={{ flex: 'none' }}>
      {row.segments.map((segment, index) => (
        <path
          key={index}
          d={segmentPath(segment)}
          fill="none"
          stroke={graphColor(segment.color)}
          strokeWidth={LINE_WIDTH}
        />
      ))}
      {isHead && (
        <circle
          cx={columnX(row.column)}
          cy={ROW_MIDDLE}
          r={NODE_RADIUS + 3}
          fill="none"
          stroke="var(--color-text)"
          strokeWidth={1.5}
        />
      )}
      <circle
        cx={columnX(row.column)}
        cy={ROW_MIDDLE}
        r={NODE_RADIUS}
        // Merges are hollow, so they stand out from ordinary commits.
        fill={isMerge ? 'var(--color-bg)' : nodeColor}
        stroke={nodeColor}
        strokeWidth={LINE_WIDTH}
      />
    </svg>
  );
}
