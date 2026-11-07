import { Segmented } from 'antd';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { readStored, writeStored } from '../../../utils/storage.js';
import styles from '../DiffView.module.css';
import { HunkRow, LineRow, PairRow } from './DiffRows.jsx';
import { buildRows } from './diffRows.js';

const MAX_ROWS = 3_000;
const VIEW_STORAGE_KEY = 'gitty-up.diff-view';
const NO_SELECTION = new Set();

const VIEWS = [
  { value: 'hunk', label: 'Hunk' },
  { value: 'inline', label: 'Inline' },
  { value: 'split', label: 'Split' },
];

/** Which view diffs show in, remembered between sessions. */
export function useDiffViewMode() {
  const [view, setView] = useState(() => readStored(VIEW_STORAGE_KEY, 'hunk'));

  const changeView = (nextView) => {
    setView(nextView);
    writeStored(VIEW_STORAGE_KEY, nextView);
  };

  return { view, changeView, fullFile: view !== 'hunk' };
}

export function DiffViewToggle({ view, onChange }) {
  return (
    <Segmented
      size="small"
      aria-label="Diff view"
      options={VIEWS}
      value={view}
      onChange={onChange}
    />
  );
}

function TruncationNotice({ total }) {
  if (total <= MAX_ROWS) return null;
  return (
    <p className={styles.truncated}>
      Showing the first {MAX_ROWS.toLocaleString()} of {total.toLocaleString()} lines.
    </p>
  );
}

/** For diffs with no parsed lines, such as a binary file or a conflict. */
function PlainDiff({ diff }) {
  const lines = diff.split('\n');
  const firstHunk = lines.findIndex((line) => line.startsWith('@@'));
  const body = firstHunk === -1 ? lines : lines.slice(firstHunk);

  return (
    <>
      <pre className={styles.diff}>
        {body.slice(0, MAX_ROWS).map((line, index) => (
          <div key={index} className={styles.plainLine}>
            {line || ' '}
          </div>
        ))}
      </pre>
      <TruncationNotice total={body.length} />
    </>
  );
}

/**
 * Renders a parsed diff in one of the views. Without `onApply` it is read-only, with
 * nothing to select and no hunk actions.
 */
export function DiffContent({
  diff,
  hunks,
  view,
  selected = NO_SELECTION,
  onToggle,
  hunkLabel,
  disabled,
  onApply,
}) {
  const rows = useMemo(() => {
    const allRows = buildRows(hunks, view);
    // Outside the hunk view, a hunk row only exists to hold its action.
    return onApply ? allRows : allRows.filter((row) => row.type !== 'hunk' || row.text);
  }, [hunks, view, onApply]);

  if (hunks.length === 0) return <PlainDiff diff={diff} />;

  return (
    <>
      <div className={clsx(styles.diff, view === 'split' && styles.splitDiff)}>
        {rows.slice(0, MAX_ROWS).map((row) => {
          if (row.type === 'hunk') {
            return (
              <HunkRow
                key={row.key}
                text={row.text}
                ids={row.ids}
                label={hunkLabel}
                disabled={disabled}
                onApply={onApply}
              />
            );
          }
          if (row.type === 'pair') {
            return (
              <PairRow
                key={row.key}
                left={row.left}
                right={row.right}
                leftSelected={row.left ? selected.has(row.left.id) : false}
                rightSelected={row.right ? selected.has(row.right.id) : false}
                onToggle={onToggle}
              />
            );
          }
          return (
            <LineRow
              key={row.key}
              line={row.line}
              selected={selected.has(row.line.id)}
              onToggle={onToggle}
            />
          );
        })}
      </div>
      <TruncationNotice total={rows.length} />
    </>
  );
}
