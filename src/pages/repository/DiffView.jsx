import { Alert, Button, Empty, Segmented, Spin } from 'antd';
import clsx from 'clsx';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useDiff } from '../../queries/git.js';
import { readStored, writeStored } from '../../utils/storage.js';
import { HunkRow, LineRow, PairRow } from './diff/DiffRows.jsx';
import { buildRows, parseDiff, selectableIds } from './diff/diffRows.js';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './DiffView.module.css';

const MAX_ROWS = 3_000;
const VIEW_STORAGE_KEY = 'gity-up.diff-view';
const NO_SELECTION = new Set();

const VIEWS = [
  { value: 'hunk', label: 'Hunk' },
  { value: 'inline', label: 'Inline' },
  { value: 'split', label: 'Split' },
];

const describeLines = (count) => (count === 1 ? '1 line' : `${count} lines`);

function TruncationNotice({ shown, total }) {
  if (total <= shown) return null;
  return (
    <p className={styles.truncated}>
      Showing the first {shown.toLocaleString()} of {total.toLocaleString()} lines.
    </p>
  );
}

/** For diffs with no lines to stage, such as a binary file or a conflict. */
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
      <TruncationNotice shown={MAX_ROWS} total={body.length} />
    </>
  );
}

function Rows({ rows, view, selected, onToggle, hunkLabel, disabled, onApply }) {
  const shownRows = rows.slice(0, MAX_ROWS);

  return (
    <>
      <div className={clsx(styles.diff, view === 'split' && styles.splitDiff)}>
        {shownRows.map((row) => {
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
      <TruncationNotice shown={MAX_ROWS} total={rows.length} />
    </>
  );
}

export function DiffView({ file }) {
  const { repository, run, isBusy } = useRepositoryContext();
  const [view, setView] = useState(() => readStored(VIEW_STORAGE_KEY, 'hunk'));
  const fullFile = view !== 'hunk';
  const { data, error, isPending } = useDiff(repository.id, file, { fullFile });
  const hash = data?.hash;

  const hunks = useMemo(() => parseDiff(data?.diff ?? ''), [data]);
  const rows = useMemo(() => buildRows(hunks, view), [hunks, view]);
  const orderedIds = useMemo(() => selectableIds(hunks), [hunks]);

  // Tied to one exact diff, since line ids mean nothing in any other.
  const [selection, setSelection] = useState({ hash: null, ids: NO_SELECTION });
  const selected = selection.hash === hash ? selection.ids : NO_SELECTION;
  const rangeStart = useRef(null);

  const toggleLine = useCallback(
    (id, extendRange) => {
      setSelection((current) => {
        const ids = new Set(current.hash === hash ? current.ids : []);
        const from = orderedIds.indexOf(rangeStart.current);
        if (extendRange && from !== -1) {
          const to = orderedIds.indexOf(id);
          const range = orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1);
          range.forEach((rangeId) => ids.add(rangeId));
        } else if (!ids.delete(id)) {
          ids.add(id);
        }
        return { hash, ids };
      });
      rangeStart.current = id;
    },
    [hash, orderedIds],
  );

  const applyLines = useCallback(
    (lines) => run('stageLines', { ...file, fullFile, hash, lines }),
    [run, file, fullFile, hash],
  );

  const changeView = (nextView) => {
    setView(nextView);
    writeStored(VIEW_STORAGE_KEY, nextView);
  };

  const verb = file?.staged ? 'Unstage' : 'Stage';

  const renderContent = () => {
    if (!file) return <Empty className="centered" description="Select a file to see its changes" />;
    if (isPending) return <Spin className="centered" />;
    if (error) return <Alert type="error" showIcon title={error.message} />;
    if (!data.diff.trim()) return <Empty className="centered" description="No text changes" />;
    if (hunks.length === 0) return <PlainDiff diff={data.diff} />;
    return (
      <Rows
        rows={rows}
        view={view}
        selected={selected}
        onToggle={toggleLine}
        hunkLabel={`${verb} hunk`}
        disabled={isBusy}
        onApply={applyLines}
      />
    );
  };

  return (
    <div className={styles.column}>
      {file && (
        <div className={styles.toolbar}>
          <Segmented
            size="small"
            aria-label="Diff view"
            options={VIEWS}
            value={view}
            onChange={changeView}
          />
          {selected.size > 0 && (
            <div className={styles.selectionActions}>
              <Button
                size="small"
                type="text"
                onClick={() => setSelection({ hash, ids: NO_SELECTION })}
              >
                Clear
              </Button>
              <Button
                size="small"
                type="primary"
                disabled={isBusy}
                onClick={() => applyLines([...selected])}
              >
                {verb} {describeLines(selected.size)}
              </Button>
            </div>
          )}
        </div>
      )}
      <div className={styles.scroller}>{renderContent()}</div>
    </div>
  );
}
