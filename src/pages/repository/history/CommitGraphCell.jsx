import { CssTokenHelper } from '../../../styles/CssTokenHelper.js';
import styles from './CommitGraphCell.module.css';

const ROW_HEIGHT = CssTokenHelper.readPixels('--size-commit-row');
const COLUMN_WIDTH = CssTokenHelper.readPixels('--size-graph-column');
const ROW_MIDDLE = ROW_HEIGHT / 2;
const MAX_VISIBLE_COLUMNS = 14;
const NODE_RADIUS = 4.5;
const LINE_WIDTH = 2;
const LINE_HIT_WIDTH = 10;
const NODE_HIT_RADIUS = NODE_RADIUS + 4;
const UNCOMMITTED_DASHES = '3 3';

// Clears the ring drawn around HEAD, with a little room to spare.
const LABEL_GAP = NODE_RADIUS + 3 + 6;

const graphColor = (color) => `var(--color-graph-${color + 1})`;
const columnX = (column) => COLUMN_WIDTH * column + COLUMN_WIDTH / 2;

/** How far along the tree a row's labels start, so that they sit beside its node. */
export const labelOffset = ({ column }) =>
  columnX(Math.min(column, MAX_VISIBLE_COLUMNS - 1)) + LABEL_GAP;

function segmentPath({ kind, from, to }) {
  const startX = columnX(from);
  const endX = columnX(to);
  const startY = kind === 'bottom' ? ROW_MIDDLE : 0;
  const endY = kind === 'top' ? ROW_MIDDLE : ROW_HEIGHT;
  if (startX === endX) return `M${startX} ${startY}V${endY}`;

  const bendY = (startY + endY) / 2;
  return `M${startX} ${startY}C${startX} ${bendY} ${endX} ${bendY} ${endX} ${endY}`;
}

/**
 * The slice of the git tree beside one commit. Rows line up to form the whole tree.
 * `isUncommitted` draws the work in progress, which is not a commit yet, as dashed.
 * `isStash` draws a stash as a hollow square on a dashed line, as it is set aside work.
 */
export function CommitGraphCell({ row, columnCount, isHead, isMerge, isUncommitted, isStash }) {
  const isDashed = isUncommitted || isStash;
  const width = Math.min(columnCount, MAX_VISIBLE_COLUMNS) * COLUMN_WIDTH;
  const nodeColor = graphColor(row.color);
  const nodeX = columnX(row.column);

  return (
    <svg width={width} height={ROW_HEIGHT} aria-hidden style={{ flex: 'none', overflow: 'visible' }}>
      {row.segments.map((segment, index) => (
        <path
          key={index}
          d={segmentPath(segment)}
          fill="none"
          stroke={graphColor(segment.color)}
          strokeWidth={LINE_WIDTH}
          strokeDasharray={isDashed && segment.kind === 'bottom' ? UNCOMMITTED_DASHES : undefined}
        />
      ))}
      {isHead && (
        <>
          <circle
            className={styles.headPulse}
            cx={nodeX}
            cy={ROW_MIDDLE}
            r={NODE_RADIUS + 3}
            fill="none"
            stroke={nodeColor}
            strokeWidth={2}
          />
          <circle
            cx={nodeX}
            cy={ROW_MIDDLE}
            r={NODE_RADIUS + 3}
            fill="none"
            stroke="var(--color-text)"
            strokeWidth={1.5}
          />
        </>
      )}
      {isStash ? (
        <rect
          x={nodeX - NODE_RADIUS}
          y={ROW_MIDDLE - NODE_RADIUS}
          width={NODE_RADIUS * 2}
          height={NODE_RADIUS * 2}
          rx={1.5}
          fill="var(--color-bg)"
          stroke={nodeColor}
          strokeWidth={LINE_WIDTH}
        />
      ) : (
        <circle
          cx={nodeX}
          cy={ROW_MIDDLE}
          r={NODE_RADIUS}
          // Merges are hollow, so they stand out from ordinary commits.
          fill={isMerge || isUncommitted ? 'var(--color-bg)' : nodeColor}
          stroke={nodeColor}
          strokeWidth={LINE_WIDTH}
          strokeDasharray={isUncommitted ? UNCOMMITTED_DASHES : undefined}
        />
      )}
      {/* Invisible and wider than what they cover, as a 2px line is hard to land on. */}
      {row.segments.map((segment, index) => (
        <path
          key={index}
          d={segmentPath(segment)}
          fill="none"
          stroke="transparent"
          strokeWidth={LINE_HIT_WIDTH}
          data-branch={segment.branch ?? ''}
        />
      ))}
      <circle
        cx={nodeX}
        cy={ROW_MIDDLE}
        r={NODE_HIT_RADIUS}
        fill="transparent"
        data-branch={row.branch ?? ''}
      />
    </svg>
  );
}
