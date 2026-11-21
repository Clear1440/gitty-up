import { Alert, Button, Empty, Spin, Switch, Tag } from 'antd';
import clsx from 'clsx';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { MenuRow } from '../../../components/MenuRow.jsx';
import { RelativeTime } from '../../../components/RelativeTime.jsx';
import { ResizeHandle } from '../../../components/ResizeHandle.jsx';
import { useResizableSizes } from '../../../components/useResizableSizes.js';
import { useReflog } from '../../../queries/git.js';
import { TextHelper } from '../../../utils/TextHelper.js';
import { CommitPane } from '../history/CommitPane.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';
import { ReflogHelper } from './ReflogHelper.js';
import { useReflogMenu } from './useReflogMenu.js';
import styles from './ReflogPage.module.css';

const PANE_LIMITS = { width: { min: 280, max: 1400 } };

function ReflogRow({ entry, selected, onSelect }) {
  const { items, newBranch, canBranch } = useReflogMenu(entry);
  const label = ReflogHelper.describe(entry);

  return (
    <MenuRow
      items={items}
      className={clsx(styles.row, selected && styles.selected, !entry.reachable && styles.lost)}
      onActivate={() => onSelect(entry)}
      menuLabel={`Actions for ${entry.selector}`}
      menuClassName={styles.menu}
    >
      <RelativeTime className={styles.time} date={entry.date} />
      <span className={styles.action}>{ReflogHelper.actionLabel(entry.action)}</span>
      {/* The whole row is clickable. This is what keyboards and screen readers use. */}
      <button
        type="button"
        className={styles.message}
        title={label}
        aria-pressed={selected}
        aria-label={`Show ${entry.shortHash}: ${label}`}
      >
        {label}
      </button>
      {entry.reachable ? (
        <span className={styles.notOnBranch} />
      ) : (
        <Tag className={styles.notOnBranch} color="warning">
          Not on any branch
        </Tag>
      )}
      <code className={styles.hash} title={entry.selector}>
        {entry.shortHash}
      </code>
      <span className={styles.recover}>
        {!entry.reachable && (
          <Button size="small" type="primary" disabled={!canBranch} onClick={newBranch}>
            New branch…
          </Button>
        )}
      </span>
    </MenuRow>
  );
}

/**
 * Where HEAD has been, newest first. Commits left behind by a reset, a rebase or an
 * amend are still here, marked "Not on any branch", until git cleans them up.
 */
export function ReflogPage() {
  const { repository } = useRepositoryContext();
  const { data: entries, error, isPending } = useReflog(repository.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const [lostOnly, setLostOnly] = useState(false);
  const layoutRef = useRef(null);
  const pane = useResizableSizes(layoutRef, 'commit-pane', PANE_LIMITS);
  const selectedHash = searchParams.get('commit');

  const select = (entry) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (next.get('commit') === entry.hash) next.delete('commit');
        else next.set('commit', entry.hash);
        return next;
      },
      { replace: true },
    );
  };

  if (repository.isMono) {
    return (
      <Empty
        className="centered"
        description="Each repository has its own reflog. Open one on its own to see it."
      />
    );
  }
  if (isPending) return <Spin className="centered" />;
  if (error) return <Alert className={styles.error} type="error" showIcon title={error.message} />;

  const lostCount = ReflogHelper.countLost(entries);
  const shown = ReflogHelper.visible(entries, lostOnly);
  // Several entries can share a commit, so the first one of it is the one marked.
  const selectedIndex = shown.findIndex(({ hash }) => hash === selectedHash);

  const renderList = () => {
    if (entries.length === 0) return <Empty className="centered" description="No reflog yet" />;
    if (shown.length === 0) {
      return <Empty className="centered" description="Nothing is lost. Every commit is on a branch." />;
    }
    return (
      <ol className={styles.list}>
        {shown.map((entry, index) => (
          <ReflogRow
            key={entry.selector}
            entry={entry}
            selected={index === selectedIndex}
            onSelect={select}
          />
        ))}
      </ol>
    );
  };

  return (
    <div
      ref={layoutRef}
      className={clsx(styles.layout, selectedHash && styles.withPane)}
      style={pane.style}
    >
      <div className={styles.scrollArea}>
        <header className={styles.header}>
          <h2 className={styles.heading}>Reflog</h2>
          <span className={styles.note}>
            {lostCount > 0
              ? `${TextHelper.countOf(lostCount, 'commit')} on no branch`
              : 'Every commit is on a branch'}
          </span>
          <label className={styles.toggle}>
            <Switch size="small" checked={lostOnly} onChange={setLostOnly} />
            Only commits on no branch
          </label>
        </header>
        {renderList()}
      </div>
      {selectedHash && (
        <CommitPane
          key={selectedHash}
          hash={selectedHash}
          onClose={() => select({ hash: selectedHash })}
          resizeHandle={<ResizeHandle label="Resize details" {...pane.handleFor('width', 'left')} />}
        />
      )}
    </div>
  );
}
