import { Segmented } from 'antd';
import clsx from 'clsx';
import { useMemo } from 'react';
import { useStoredState } from '../../../utils/useStoredState.js';
import styles from '../DiffView.module.css';
import { HunkRow, LineRow, PairRow } from './DiffRows.jsx';
import { buildRows, toDiffView } from './diffRows.js';
import { annotateWordChanges } from './wordDiff.js';

const MAX_ROWS = 3_000;
const VIEW_STORAGE_KEY = 'gitty-up.diff-view';
const NO_SELECTION = new Set();

const CONTEXTS = [
  { value: 'hunk', label: 'Hunk' },
  { value: 'full', label: 'Full' },
];

const LAYOUTS = [
  { value: 'inline', label: 'Inline' },
  { value: 'split', label: 'Split' },
];

/**
 * How diffs show, remembered between sessions: `view.context` is just the hunks or the
 * full file, and `view.layout` inline or side by side. `changeView` takes either part.
 */
export function useDiffViewMode() {
  const [stored, setStored] = useStoredState(VIEW_STORAGE_KEY, 'hunk');
  const view = toDiffView(stored);
  const changeView = (change) => setStored({ ...view, ...change });
  // Only hunk context shows git's hunks. The full file needs every line to lay out.
  return { view, changeView, fullFile: view.context === 'full' };
}

export function DiffViewToggle({ view, onChange }) {
  return (
    <span className={styles.viewToggles}>
      <Segmented
        size="small"
        aria-label="Diff context"
        options={CONTEXTS}
        value={view.context}
        onChange={(context) => onChange({ context })}
      />
      <Segmented
        size="small"
        aria-label="Diff layout"
        options={LAYOUTS}
        value={view.layout}
        onChange={(layout) => onChange({ layout })}
      />
    </span>
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
 * nothing to click or select and no hunk actions. With it, a click on a changed line
 * calls `onApply` with just that line, and a shift or ctrl click calls `onToggle`.
 */
export function DiffContent({
  diff,
  hunks,
  view,
  selected = NO_SELECTION,
  onToggle,
  hunkLabel,
  lineLabel,
  disabled,
  onApply,
}) {
  const { layout } = toDiffView(view);
  const annotated = useMemo(() => annotateWordChanges(hunks), [hunks]);
  const rows = useMemo(() => {
    const allRows = buildRows(annotated, view);
    // Outside the hunk view, a hunk row only exists to hold its action.
    return onApply ? allRows : allRows.filter((row) => row.type !== 'hunk' || row.text);
  }, [annotated, view, onApply]);

  const actions = useMemo(
    () =>
      onApply && !disabled
        ? { onToggle, onStage: (id) => onApply([id]), stageLabel: lineLabel ?? 'Stage' }
        : {},
    [onApply, onToggle, disabled, lineLabel],
  );

  if (hunks.length === 0) return <PlainDiff diff={diff} />;

  return (
    <>
      <div className={clsx(styles.diff, layout === 'split' && styles.splitDiff)}>
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
                actions={actions}
              />
            );
          }
          return (
            <LineRow
              key={row.key}
              line={row.line}
              selected={selected.has(row.line.id)}
              actions={actions}
            />
          );
        })}
      </div>
      <TruncationNotice total={rows.length} />
    </>
  );
}
