import { CloudOutlined, LaptopOutlined } from '@ant-design/icons';
import { Avatar, Button, Empty, Result, Spin, Tag } from 'antd';
import clsx from 'clsx';
import { useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { ResizeHandle } from '../../components/ResizeHandle.jsx';
import { useResizableSizes } from '../../components/useResizableSizes.js';
import { UNCOMMITTED, paths } from '../../paths.js';
import { useCommits } from '../../queries/git.js';
import { layoutCommitGraph } from './history/commitGraph.js';
import { CommitGraphCell } from './history/CommitGraphCell.jsx';
import { countChangedFiles } from './countChangedFiles.js';
import { CommitPane } from './history/CommitPane.jsx';
import { GraphTooltipArea } from './history/GraphTooltipArea.jsx';
import { groupRefs } from './history/groupRefs.js';
import { WorkingTreePane } from './history/WorkingTreePane.jsx';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './HistoryPage.module.css';

const REF_TAG_STYLES = { head: styles.refHead, branch: styles.refBranch, tag: styles.refTag };

const COLUMN_LIMITS = {
  tree: { min: 24, max: 480 },
  branch: { min: 70, max: 640 },
  author: { min: 60, max: 400 },
  time: { min: 60, max: 240 },
  sha: { min: 48, max: 320 },
};

const PANE_LIMITS = { width: { min: 280, max: 1400 } };

function ColumnHeading({ title, label = title, handle }) {
  return (
    <div className={styles.columnHeading}>
      <span className={styles.columnTitle}>{title}</span>
      {handle && (
        <ResizeHandle className={styles.columnHandle} label={`Resize ${label}`} {...handle} />
      )}
    </div>
  );
}

/**
 * Column titles, in the order CommitRow renders its cells. Columns left of the commit
 * message drag by their right edge and those right of it by their left, because the
 * commit message has no size of its own: it takes whatever the others leave.
 */
function ColumnHeadings({ handleFor }) {
  return (
    <div className={styles.columnHeadings}>
      <ColumnHeading label="tree" handle={handleFor('tree')} />
      <ColumnHeading title="Branch" handle={handleFor('branch')} />
      <ColumnHeading title="Author" handle={handleFor('author')} />
      <ColumnHeading title="Commit message" />
      <ColumnHeading title="Time" handle={handleFor('time', 'left')} />
      <ColumnHeading title="SHA" handle={handleFor('sha', 'left')} />
    </div>
  );
}

function describeRefGroup({ name, local, remotes }) {
  return [local && `Local: ${name}`, ...remotes.map((remote) => `Remote: ${remote}`)]
    .filter(Boolean)
    .join('\n');
}

function RefTag({ group }) {
  return (
    <Tag
      className={REF_TAG_STYLES[group.type]}
      title={group.type === 'tag' ? group.name : describeRefGroup(group)}
    >
      <span className={styles.refName}>{group.name}</span>
      {group.local && <LaptopOutlined className={styles.refIcon} aria-label="Local" />}
      {group.remotes.length > 0 && (
        <CloudOutlined className={styles.refIcon} aria-label="On a remote" />
      )}
    </Tag>
  );
}

/** Stands in for the work in progress, so that the tree can draw it as HEAD's next commit. */
function uncommittedCommit(branch, headHash) {
  return {
    hash: UNCOMMITTED,
    parents: headHash ? [headHash] : [],
    refs: [{ type: 'head', name: branch ?? 'HEAD' }],
  };
}

function UncommittedRow({ graphRow, columnCount, fileCount, selected, onSelect }) {
  return (
    <li
      className={clsx(styles.commit, selected && styles.selectedCommit)}
      onClick={() => onSelect(UNCOMMITTED)}
    >
      <div className={styles.tree}>
        <CommitGraphCell row={graphRow} columnCount={columnCount} isUncommitted />
      </div>
      <div />
      <div />
      <button
        type="button"
        className={clsx(styles.subject, styles.uncommitted)}
        aria-pressed={selected}
      >
        Uncommitted changes
      </button>
      <span className={styles.time}>{fileCount === 1 ? '1 file' : `${fileCount} files`}</span>
      <div />
    </li>
  );
}

function CommitRow({ commit, graphRow, columnCount, selected, onSelect }) {
  return (
    <li
      className={clsx(styles.commit, selected && styles.selectedCommit)}
      onClick={() => onSelect(commit.hash)}
    >
      <div className={styles.tree}>
        <CommitGraphCell
          row={graphRow}
          columnCount={columnCount}
          isHead={commit.refs.some((ref) => ref.type === 'head')}
          isMerge={commit.parents.length > 1}
        />
      </div>
      <div className={styles.refs}>
        {groupRefs(commit.refs).map((group) => (
          <RefTag key={group.key} group={group} />
        ))}
      </div>
      <span className={styles.author} title={`${commit.author} <${commit.email}>`}>
        {/* Shows the initial until the picture loads, and for good if there is none. */}
        <Avatar className={styles.avatar} size={20} src={commit.avatarUrl} alt="">
          {commit.author.charAt(0).toUpperCase()}
        </Avatar>
        <span className={styles.authorName}>{commit.author}</span>
      </span>
      {/* The whole row is clickable. This is what keyboards and screen readers use. */}
      <button
        type="button"
        className={styles.subject}
        title={commit.subject}
        aria-pressed={selected}
      >
        {commit.subject}
      </button>
      <RelativeTime className={styles.time} date={commit.date} />
      <code className={styles.hash} title={commit.hash}>
        {commit.shortHash}
      </code>
    </li>
  );
}

export function HistoryPage() {
  const { repository, status } = useRepositoryContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const ref = searchParams.get('ref') ?? undefined;
  const selectedHash = searchParams.get('commit');
  const { data: commits, error, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useCommits(repository.id, ref);
  const fileCount = countChangedFiles(status);
  // Work in progress sits on the checked out branch, so other branches' histories omit it.
  // A paused merge counts even with no files left, as it still has to be committed.
  const showUncommitted =
    (fileCount > 0 || Boolean(status.operation)) && (!ref || ref === status.branch);
  const { branch: currentBranch, headHash } = status;
  const graph = useMemo(
    () =>
      layoutCommitGraph([
        ...(showUncommitted ? [uncommittedCommit(currentBranch, headHash)] : []),
        ...(commits ?? []),
      ]),
    [commits, showUncommitted, currentBranch, headHash],
  );
  const graphRowOffset = showUncommitted ? 1 : 0;
  const tableRef = useRef(null);
  const { style, handleFor } = useResizableSizes(tableRef, 'history', COLUMN_LIMITS);
  const layoutRef = useRef(null);
  const pane = useResizableSizes(layoutRef, 'commit-pane', PANE_LIMITS);

  /** Opens a commit or the uncommitted changes, or closes it if it was already open. */
  const toggleCommit = (hash) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (next.get('commit') === hash) next.delete('commit');
        else next.set('commit', hash);
        return next;
      },
      { replace: true },
    );
  };

  const showAllBranches = (
    <Link to={paths.history(repository.id)}>
      <Button size="small">Show all branches</Button>
    </Link>
  );

  if (isPending) return <Spin className="centered" />;
  if (error) {
    return (
      <Result
        status="warning"
        title={`Could not read ${ref ?? 'history'}`}
        subTitle={error.message}
        extra={showAllBranches}
      />
    );
  }
  // A first commit is still to be made from here, so changes keep an empty history open.
  if (commits.length === 0 && !showUncommitted && !selectedHash) {
    return <Empty className="centered" description="No commits yet" />;
  }

  const paneHandle = <ResizeHandle label="Resize details" {...pane.handleFor('width', 'left')} />;

  return (
    <div
      ref={layoutRef}
      className={clsx(styles.layout, selectedHash && styles.withPane)}
      style={pane.style}
    >
      <div className={styles.scrollArea}>
        <header className={styles.header}>
          <h2 className={styles.heading}>{ref ?? 'All branches'}</h2>
          {ref && showAllBranches}
        </header>
        <div ref={tableRef} className={styles.table} style={style}>
          <ColumnHeadings handleFor={handleFor} />
          <GraphTooltipArea>
            <ol className={styles.list}>
              {showUncommitted && (
                <UncommittedRow
                  graphRow={graph.rows[0]}
                  columnCount={graph.columnCount}
                  fileCount={fileCount}
                  selected={selectedHash === UNCOMMITTED}
                  onSelect={toggleCommit}
                />
              )}
              {commits.map((commit, index) => (
                <CommitRow
                  key={commit.hash}
                  commit={commit}
                  graphRow={graph.rows[index + graphRowOffset]}
                  columnCount={graph.columnCount}
                  selected={commit.hash === selectedHash}
                  onSelect={toggleCommit}
                />
              ))}
            </ol>
          </GraphTooltipArea>
        </div>
        {hasNextPage && (
          <div className={styles.loadMore}>
            <Button loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </div>
      {selectedHash === UNCOMMITTED && (
        <WorkingTreePane onClose={() => toggleCommit(UNCOMMITTED)} resizeHandle={paneHandle} />
      )}
      {selectedHash && selectedHash !== UNCOMMITTED && (
        <CommitPane
          key={selectedHash}
          hash={selectedHash}
          onClose={() => toggleCommit(selectedHash)}
          resizeHandle={paneHandle}
        />
      )}
    </div>
  );
}
