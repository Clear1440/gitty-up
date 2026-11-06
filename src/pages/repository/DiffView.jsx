import { Alert, Button, Empty, Spin } from 'antd';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useDiff } from '../../queries/git.js';
import { DiffContent, DiffViewToggle, useDiffViewMode } from './diff/DiffContent.jsx';
import { parseDiff, selectableIds } from './diff/diffRows.js';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './DiffView.module.css';

const NO_SELECTION = new Set();

const describeLines = (count) => (count === 1 ? '1 line' : `${count} lines`);

export function DiffView({ file }) {
  const { repository, run, isBusy } = useRepositoryContext();
  const { view, changeView, fullFile } = useDiffViewMode();
  const { data, error, isPending } = useDiff(repository.id, file, { fullFile });
  const hash = data?.hash;

  const hunks = useMemo(() => parseDiff(data?.diff ?? ''), [data]);
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

  const verb = file?.staged ? 'Unstage' : 'Stage';

  const renderContent = () => {
    if (!file) return <Empty className="centered" description="Select a file to see its changes" />;
    if (isPending) return <Spin className="centered" />;
    if (error) return <Alert type="error" showIcon title={error.message} />;
    if (!data.diff.trim()) return <Empty className="centered" description="No text changes" />;
    return (
      <DiffContent
        diff={data.diff}
        hunks={hunks}
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
          <DiffViewToggle view={view} onChange={changeView} />
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
