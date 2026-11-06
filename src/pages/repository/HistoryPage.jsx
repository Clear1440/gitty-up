import { CloudOutlined, LaptopOutlined, PullRequestOutlined } from '@ant-design/icons';
import { Avatar, Button, Empty, Result, Spin, Tag } from 'antd';
import clsx from 'clsx';
import { useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { ResizeHandle } from '../../components/ResizeHandle.jsx';
import { useResizableSizes } from '../../components/useResizableSizes.js';
import { UNCOMMITTED, paths } from '../../paths.js';
import { useCommits, usePullRequests } from '../../queries/git.js';
import { layoutCommitGraph } from './history/commitGraph.js';
import { CommitGraphCell, labelOffset } from './history/CommitGraphCell.jsx';
import { countChangedFiles } from './countChangedFiles.js';
import { CommitPane } from './history/CommitPane.jsx';
import { GraphTooltipArea } from './history/GraphTooltipArea.jsx';
import { findBranchTip, groupHasBranch, groupRefs } from './history/groupRefs.js';
import { RefContextMenu } from './history/RefContextMenu.jsx';
import { WorkingTreePane } from './history/WorkingTreePane.jsx';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './HistoryPage.module.css';

const REF_TAG_STYLES = { head: styles.refHead, branch: styles.refBranch, tag: styles.refTag };

const COLUMN_LIMITS = {
  graph: { min: 24, max: 800 },
  author: { min: 60, max: 400 },
  time: { min: 60, max: 240 },
  sha: { min: 48, max: 320 },
};

const PANE_LIMITS = { width: { min: 280, max: 1400 } };

// How far back to page through history for a branch, before leaving it to the user.
const MAX_COMMITS_SEARCHED = 2_000;

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
      <ColumnHeading title="Branch" handle={handleFor('graph')} />
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

function PullRequestLink({ pullRequest }) {
  const { number, title, url, draft } = pullRequest;
  return (
    <a
      className={styles.refPullRequest}
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`${draft ? 'Draft pull request' : 'Pull request'} #${number}: ${title}`}
      aria-label={`Open pull request #${number}`}
      // A click here opens the pull request, not the commit it sits on.
      onClick={(event) => event.stopPropagation()}
    >
      <PullRequestOutlined />
    </a>
  );
}

/** `focusRequest` plays the ring around it, and a new value plays it again. */
function RefTag({ group, pullRequest, focusRequest }) {
  return (
    <RefContextMenu group={group}>
      <Tag
        className={REF_TAG_STYLES[group.type]}
        title={group.type === 'tag' ? group.name : describeRefGroup(group)}
      >
        <span className={styles.refName}>{group.name}</span>
        {group.local && <LaptopOutlined className={styles.refIcon} aria-label="Local" />}
        {group.remotes.length > 0 && (
          <CloudOutlined className={styles.refIcon} aria-label="On a remote" />
        )}
        {pullRequest && <PullRequestLink pullRequest={pullRequest} />}
        {focusRequest && <span key={focusRequest} className={styles.focusRing} aria-hidden />}
      </Tag>
    </RefContextMenu>
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
      <button
        type="button"
        className={clsx(styles.subject, styles.uncommitted)}
        aria-pressed={selected}
      >
        Uncommitted changes
        {/* A paused merge can have nothing left to count. */}
        {fileCount > 0 && ` (${fileCount === 1 ? '1 file' : `${fileCount} files`})`}
      </button>
      <div />
      <div />
    </li>
  );
}

function CommitRow({ commit, graphRow, columnCount, selected, focus, pullRequests, onSelect }) {
  const groups = groupRefs(commit.refs);

  return (
    <li
      className={clsx(styles.commit, selected && styles.selectedCommit)}
      data-hash={commit.hash}
      // React bubbles clicks out of a label's menu to here, though it is elsewhere on the page.
      onClick={(event) => event.currentTarget.contains(event.target) && onSelect(commit.hash)}
    >
      <div className={styles.tree}>
        <CommitGraphCell
          row={graphRow}
          columnCount={columnCount}
          isHead={commit.refs.some((ref) => ref.type === 'head')}
          isMerge={commit.parents.length > 1}
        />
        {groups.length > 0 && (
          <div className={styles.refs} style={{ marginLeft: labelOffset(graphRow) }}>
            {groups.map((group) => (
              <RefTag
                key={group.key}
                group={group}
                pullRequest={group.type === 'tag' ? undefined : pullRequests.get(group.name)}
                focusRequest={
                  focus && groupHasBranch(group, focus.branch) ? focus.request : undefined
                }
              />
            ))}
          </div>
        )}
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
  const { data: pullRequestList } = usePullRequests(repository.id);
  const pullRequests = useMemo(
    () => new Map((pullRequestList ?? []).map((pull) => [pull.branch, pull])),
    [pullRequestList],
  );
  const { state: navigationState } = useLocation();
  const focusedBranch = ref ? null : searchParams.get('focus');
  const focusRequest = navigationState?.focusBranch;
  const focusedHash = focusedBranch ? findBranchTip(commits ?? [], focusedBranch)?.hash : undefined;
  // Pages load newest first, so a quiet branch can be further back than what is showing.
  const isSearching =
    Boolean(focusedBranch) &&
    !focusedHash &&
    hasNextPage &&
    (commits?.length ?? 0) < MAX_COMMITS_SEARCHED;
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

  useEffect(() => {
    if (isSearching && !isFetchingNextPage) fetchNextPage();
  }, [isSearching, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    // Only on request, so opening a commit never jumps the list back to the branch.
    if (!focusedHash || !focusRequest) return;
    const row = tableRef.current?.querySelector(`[data-hash="${focusedHash}"]`);
    row?.scrollIntoView({ block: 'center' });
  }, [focusedHash, focusRequest]);

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
          {focusedBranch && !focusedHash && !isSearching && !isFetchingNextPage && (
            <>
              <span className={styles.focusNote}>
                {focusedBranch} is not in the commits loaded here.
              </span>
              <Link to={paths.history(repository.id, focusedBranch)}>
                <Button size="small">Show only this branch</Button>
              </Link>
            </>
          )}
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
                  focus={
                    commit.hash === focusedHash && focusRequest
                      ? { branch: focusedBranch, request: focusRequest }
                      : undefined
                  }
                  pullRequests={pullRequests}
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
