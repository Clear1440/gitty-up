import { ColumnWidthOutlined } from '@ant-design/icons';
import { Button, Empty, Segmented } from 'antd';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Tooltip } from '../../../components/Tooltip.jsx';
import { useStoredState } from '../../../utils/useStoredState.js';
import styles from '../DiffView.module.css';
import { HunkRow, LineRow, PairRow } from './DiffRows.jsx';
import { buildRows, toDiffView } from './diffRows.js';
import { annotateWordChanges } from './wordDiff.js';

const MAX_ROWS = 3_000;
const VIEW_STORAGE_KEY = 'gitty-up.diff-view';
const WHITESPACE_STORAGE_KEY = 'gitty-up.diff-ignore-whitespace';
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
 * full file, `view.layout` inline or side by side, and `view.ignoreWhitespace` whether
 * changes to spaces and tabs are left out. `changeView` takes any of them.
 */
export function useDiffViewMode() {
  const [stored, setStored] = useStoredState(VIEW_STORAGE_KEY, 'hunk');
  const [ignoreWhitespace, setIgnoreWhitespace] = useStoredState(WHITESPACE_STORAGE_KEY, false, {
    isValid: (value) => typeof value === 'boolean',
  });
  const layout = toDiffView(stored);
  const view = { ...layout, ignoreWhitespace };
  const changeView = ({ ignoreWhitespace: nextIgnore, ...change }) => {
    if (nextIgnore !== undefined) setIgnoreWhitespace(nextIgnore);
    if (Object.keys(change).length > 0) setStored({ ...layout, ...change });
  };
  // Only hunk context shows git's hunks. The full file needs every line to lay out.
  return { view, changeView, fullFile: view.context === 'full', ignoreWhitespace };
}

function WhitespaceToggle({ ignored, onChange }) {
  return (
    <Tooltip title={ignored ? 'Show whitespace changes' : 'Ignore whitespace changes'}>
      <Button
        size="small"
        icon={<ColumnWidthOutlined />}
        aria-label="Ignore whitespace"
        aria-pressed={ignored}
        color={ignored ? 'primary' : 'default'}
        variant={ignored ? 'filled' : 'outlined'}
        onClick={() => onChange(!ignored)}
      />
    </Tooltip>
  );
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
      <WhitespaceToggle
        ignored={Boolean(view.ignoreWhitespace)}
        onChange={(ignoreWhitespace) => onChange({ ignoreWhitespace })}
      />
    </span>
  );
}

/**
 * In place of a diff with nothing in it. With whitespace ignored, that is almost always
 * a file whose only changes are to spaces and tabs.
 */
export function EmptyDiff({ ignoreWhitespace }) {
  return (
    <Empty
      className="centered"
      description={
        ignoreWhitespace
          ? 'Only whitespace changed. Turn off Ignore whitespace to see it.'
          : 'No text changes'
      }
    />
  );
}

/**
 * Why single lines and hunks can't be staged from a diff that ignores whitespace: its
 * lines no longer match the file, so a patch built from them could go wrong.
 */
function whitespaceBlockReason(verb, canDiscard) {
  const verbs = canDiscard ? `${verb.toLowerCase()} or discard` : verb.toLowerCase();
  return (
    "Whitespace is ignored, so these lines don't match the file. " +
    `Turn off Ignore whitespace to ${verbs} single lines and hunks.`
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

/** The changed line under the pointer or focused, by its id, or null. */
function useActiveLine() {
  const [activeId, setActiveId] = useState(null);
  const follow = (event) => {
    const id = event.target.closest?.('[data-line-id]')?.dataset.lineId;
    const next = id === undefined ? null : Number(id);
    if (next !== activeId) setActiveId(next);
  };
  return {
    activeId,
    handlers: { onMouseOver: follow, onFocus: follow, onMouseLeave: () => setActiveId(null) },
  };
}

/**
 * Renders a parsed diff in one of the views. Without `onApply` it is read-only, with
 * nothing to click or select and no hunk actions. With it, a click on a changed line
 * calls `onApply` with just that line, and a shift or ctrl click calls `onToggle`. With
 * `onDiscard` too, hunks and lines offer to throw their changes away. While
 * `view.ignoreWhitespace` is on, those actions stay in sight but are turned off.
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
  onDiscard,
}) {
  const { layout } = toDiffView(view);
  const annotated = useMemo(() => annotateWordChanges(hunks, { maxRows: MAX_ROWS }), [hunks]);
  const rows = useMemo(() => {
    const allRows = buildRows(annotated, view);
    // Outside the hunk view, a hunk row only exists to hold its action.
    return onApply ? allRows : allRows.filter((row) => row.type !== 'hunk' || row.text);
  }, [annotated, view, onApply]);
  const { activeId, handlers } = useActiveLine();
  const blockedReason =
    onApply && view?.ignoreWhitespace
      ? whitespaceBlockReason(lineLabel ?? 'Stage', Boolean(onDiscard))
      : null;

  const actions = useMemo(() => {
    if (blockedReason) return { blockedReason };
    return onApply && !disabled
      ? {
          onToggle,
          onStage: (id) => onApply([id]),
          onDiscard,
          stageLabel: lineLabel ?? 'Stage',
        }
      : {};
  }, [onApply, onDiscard, onToggle, disabled, lineLabel, blockedReason]);

  if (hunks.length === 0) return <PlainDiff diff={diff} />;

  return (
    <>
      <div
        className={clsx(styles.diff, layout === 'split' && styles.splitDiff)}
        {...(onApply && !blockedReason ? handlers : {})}
      >
        {rows.slice(0, MAX_ROWS).map((row) => {
          if (row.type === 'hunk') {
            return (
              <HunkRow
                key={row.key}
                text={row.text}
                ids={row.ids}
                label={hunkLabel}
                disabled={disabled}
                blockedReason={blockedReason}
                onApply={onApply}
                onDiscard={onDiscard}
              />
            );
          }
          if (row.type === 'pair') {
            const isActive = row.left?.id === activeId || row.right?.id === activeId;
            return (
              <PairRow
                key={row.key}
                left={row.left}
                right={row.right}
                leftSelected={row.left ? selected.has(row.left.id) : false}
                rightSelected={row.right ? selected.has(row.right.id) : false}
                activeId={isActive ? activeId : null}
                actions={actions}
              />
            );
          }
          return (
            <LineRow
              key={row.key}
              line={row.line}
              selected={selected.has(row.line.id)}
              active={row.line.id === activeId}
              actions={actions}
            />
          );
        })}
      </div>
      <TruncationNotice total={rows.length} />
    </>
  );
}
