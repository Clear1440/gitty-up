import {
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  CloudOutlined,
  ExclamationCircleFilled,
  InboxOutlined,
  LaptopOutlined,
  PullRequestOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Empty, Result, Spin, Tag } from 'antd';
import clsx from 'clsx';
import { Fragment, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { MenuRow } from '../../components/MenuRow.jsx';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { ResizeHandle } from '../../components/ResizeHandle.jsx';
import { TreeIcon } from '../../components/TreeIcon.jsx';
import { useResizableSizes } from '../../components/useResizableSizes.js';
import { StashSelection, UNCOMMITTED, paths } from '../../paths.js';
import { useBranches, useCommits, usePullRequests, useStashes } from '../../queries/git.js';
import { KeyboardHelper } from '../../utils/KeyboardHelper.js';
import { TextHelper } from '../../utils/TextHelper.js';
import { CommitHelper } from './CommitHelper.js';
import { PullRequestHelper } from './PullRequestHelper.js';
import { layoutCommitGraph } from './history/commitGraph.js';
import { CommitGraphCell, labelOffset } from './history/CommitGraphCell.jsx';
import { CommitPane } from './history/CommitPane.jsx';
import { CommitSearch } from './history/CommitSearch.jsx';
import { findMatches } from './history/commitSearch.js';
import { GraphTooltipArea } from './history/GraphTooltipArea.jsx';
import {
  arrangeLabels,
  branchOfGroup,
  findBranchTip,
  findTagCommit,
  groupHasBranch,
  groupRefs,
} from './history/groupRefs.js';
import { RefBranchActions } from './history/RefBranchActions.jsx';
import { StashPane } from './history/StashPane.jsx';
import { interleaveStashes } from './history/stashRows.js';
import { useCommitMenu } from './history/useCommitMenu.js';
import { RepositoryTag } from './RepositoryTag.jsx';
import { WorkingTreePane } from './history/WorkingTreePane.jsx';
import { useRepositoryContext } from './RepositoryContext.js';
import { StatusHelper } from './StatusHelper.js';
import { useStashMenu } from './useStashMenu.js';
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

/** The small mark beside a pull request's icon, by PullRequestHelper.summarize. */
const PULL_REQUEST_STATUS = {
  passing: { Icon: CheckCircleFilled, className: styles.prPassing },
  failing: { Icon: CloseCircleFilled, className: styles.prFailing },
  'changes-requested': { Icon: ExclamationCircleFilled, className: styles.prAttention },
  pending: { Icon: ClockCircleFilled, className: styles.prPending },
};

function PullRequestLink({ pullRequest }) {
  const { number, url } = pullRequest;
  const status = PULL_REQUEST_STATUS[PullRequestHelper.summarize(pullRequest)];
  const description = PullRequestHelper.describe(pullRequest);
  return (
    <a
      className={styles.refPullRequest}
      href={url}
      target="_blank"
      rel="noreferrer"
      title={description}
      aria-label={[`Open pull request #${number}`, ...description.split('\n').slice(1)].join('. ')}
      // A click here opens the pull request, not the commit it sits on or a checkout.
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <PullRequestOutlined />
      {status && <status.Icon className={clsx(styles.prStatus, status.className)} />}
    </a>
  );
}

/**
 * `focusRequest` plays the pulse around it, and a new value plays it again. `onSelect`,
 * for a branch, picks it on a click: see RefStack.
 */
/** Where a label's local branch is checked out, if that is another working tree. */
function useOtherWorktree(group) {
  const { repository } = useRepositoryContext();
  const { data: branches } = useBranches(repository.id);
  if (!group.local) return null;
  const branch = branches?.local.find(({ name }) => name === group.name);
  return branch && !branch.isCurrent ? branch.worktreePath : null;
}

function RefTag({ group, pullRequest, focusRequest, onSelect }) {
  const isBranch = group.type !== 'tag';
  const worktreePath = useOtherWorktree(group);
  return (
    <RefBranchActions group={group}>
      <Tag
        key={focusRequest}
        className={clsx(REF_TAG_STYLES[group.type], focusRequest && styles.focusPulse)}
        title={
          isBranch
            ? [describeRefGroup(group), worktreePath && `Checked out in ${worktreePath}`]
                .filter(Boolean)
                .join('\n')
            : group.name
        }
        onClick={
          isBranch
            ? (event) => {
                // The row would open the commit too, which onSelect does itself.
                event.stopPropagation();
                onSelect(branchOfGroup(group));
              }
            : undefined
        }
      >
        <span className={styles.refName}>{group.name}</span>
        {group.local &&
          (worktreePath ? (
            <TreeIcon className={styles.refIcon} aria-label="Checked out in another worktree" />
          ) : (
            <LaptopOutlined className={styles.refIcon} aria-label="Local" />
          ))}
        {group.remotes.length > 0 && (
          <CloudOutlined className={styles.refIcon} aria-label="On a remote" />
        )}
        {pullRequest && <PullRequestLink pullRequest={pullRequest} />}
      </Tag>
    </RefBranchActions>
  );
}

/**
 * A commit's labels. Its branches stack like cards so the one in front can be read in
 * full: the selected branch, or else the checked out one. The rest peek out behind it,
 * and drop down one to a line on hover, where a click selects one and brings it to the
 * front. Tags mark versions, so they never hide in the stack: each shows in full after
 * the front branch, as "[main] [0.3.0] +1".
 */
function RefStack({ groups, selectedBranch, offset, renderTag }) {
  const { branches, tags } = arrangeLabels(groups, selectedBranch);
  const [front, ...rest] = branches;
  const isStacked = rest.length > 0;

  return (
    <div className={clsx(styles.refs, isStacked && styles.stacked)} style={{ marginLeft: offset }}>
      {front && !isStacked && renderTag(front)}
      {isStacked && (
        <div className={styles.refStack}>
          <div className={styles.refFront}>{renderTag(front)}</div>
          {rest.map((group, index) => (
            <div
              key={group.key}
              className={clsx(styles.refLayer, index >= 2 && styles.refLayerDeep)}
              style={{ '--layer': index + 1 }}
            >
              {renderTag(group)}
            </div>
          ))}
        </div>
      )}
      {tags.map((group) => (
        <Fragment key={group.key}>{renderTag(group)}</Fragment>
      ))}
      {isStacked && (
        <span
          className={styles.refMore}
          title={rest.map((group) => group.name).join('\n')}
          aria-label={`${TextHelper.countOf(rest.length, 'more branch', 'more branches')}`}
        >
          +{rest.length}
        </span>
      )}
    </div>
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

/** How a row shows while searching: the match on show, another match, or not a match. */
const SEARCH_STYLES = {
  current: styles.searchCurrent,
  match: styles.searchMatch,
  dimmed: styles.searchDimmed,
};

function UncommittedRow({ graphRow, columnCount, fileCount, selected, onSelect, searchState }) {
  return (
    <li
      className={clsx(styles.commit, selected && styles.selectedCommit, SEARCH_STYLES[searchState])}
      data-hash={UNCOMMITTED}
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
        {fileCount > 0 && ` (${TextHelper.countOf(fileCount, 'file')})`}
      </button>
      <div />
      <div />
    </li>
  );
}

/** A stash, drawn as a short branch off the commit it was made on. */
function StashRow({ entry, graphRow, columnCount, selected, onSelect, searchState }) {
  const { stash } = entry;
  const items = useStashMenu(stash);

  return (
    <MenuRow
      items={items}
      className={clsx(styles.commit, selected && styles.selectedCommit, SEARCH_STYLES[searchState])}
      data-hash={entry.hash}
      onActivate={() => onSelect(entry.hash)}
    >
      <div className={styles.tree}>
        <CommitGraphCell row={graphRow} columnCount={columnCount} isStash />
      </div>
      <span className={styles.author}>
        <InboxOutlined className={styles.stashIcon} />
        <span className={styles.authorName}>Stash</span>
      </span>
      <button
        type="button"
        className={clsx(styles.subject, styles.stash)}
        title={stash.message}
        aria-pressed={selected}
      >
        {stash.message}
      </button>
      <RelativeTime className={styles.time} date={stash.date} />
      <code className={styles.hash} title={stash.hash}>
        {stash.ref}
      </code>
    </MenuRow>
  );
}

function CommitRow({
  commit,
  graphRow,
  columnCount,
  selected,
  focus,
  selectedBranch,
  pullRequests,
  onSelect,
  onSelectBranch,
  searchState,
}) {
  const groups = groupRefs(commit.refs);
  const { items, checkout } = useCommitMenu(commit);

  return (
    <MenuRow
      items={items}
      className={clsx(styles.commit, selected && styles.selectedCommit, SEARCH_STYLES[searchState])}
      data-hash={commit.hash}
      // The second click of a double click would close the commit again.
      onActivate={(event) => event.detail < 2 && onSelect(commit.hash)}
      onDoubleActivate={checkout}
    >
      <div className={styles.tree}>
        <CommitGraphCell
          row={graphRow}
          columnCount={columnCount}
          isHead={CommitHelper.isHead(commit)}
          isMerge={CommitHelper.isMerge(commit)}
        />
        {groups.length > 0 && (
          <RefStack
            groups={groups}
            selectedBranch={selectedBranch}
            offset={labelOffset(graphRow)}
            renderTag={(group) => (
              <RefTag
                group={group}
                pullRequest={group.type === 'tag' ? undefined : pullRequests.get(group.name)}
                focusRequest={
                  focus && groupHasBranch(group, focus.branch) ? focus.request : undefined
                }
                onSelect={(branch) => onSelectBranch(branch, commit.hash)}
              />
            )}
          />
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
        {commit.repository && (
          <RepositoryTag name={commit.repository} className={styles.repository} />
        )}
        {commit.subject}
      </button>
      <RelativeTime className={styles.time} date={commit.date} />
      <code className={styles.hash} title={commit.hash}>
        {commit.shortHash}
      </code>
    </MenuRow>
  );
}

export function HistoryPage() {
  const { repository, status } = useRepositoryContext();
  const allBranchesLabel = repository.isMono ? 'All shared branches' : 'All branches';
  const [searchParams, setSearchParams] = useSearchParams();
  const ref = searchParams.get('ref') ?? undefined;
  const selectedHash = searchParams.get('commit');
  const { data: commits, error, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useCommits(repository.id, ref);
  const { data: pullRequestList } = usePullRequests(repository.id);
  const { data: stashes = [] } = useStashes(repository.id);
  const selectedStash = StashSelection.toHash(selectedHash);
  const pullRequests = useMemo(
    () => new Map((pullRequestList ?? []).map((pull) => [pull.branch, pull])),
    [pullRequestList],
  );
  const { state: navigationState } = useLocation();
  const focusedBranch = ref ? null : searchParams.get('focus');
  const focusRequest = navigationState?.focusBranch;
  // A tag picked in the sidebar is scrolled to the same way, though it has no label to pulse.
  const focusedTag = ref || focusedBranch ? null : searchParams.get('focusTag');
  const focusedName = focusedBranch ?? focusedTag;
  const focusedCommit = focusedBranch
    ? findBranchTip(commits ?? [], focusedBranch)
    : focusedTag && findTagCommit(commits ?? [], focusedTag);
  const focusedHash = focusedCommit?.hash;
  // Pages load newest first, so a quiet branch can be further back than what is showing.
  const isSearching =
    Boolean(focusedName) &&
    !focusedHash &&
    hasNextPage &&
    (commits?.length ?? 0) < MAX_COMMITS_SEARCHED;
  const fileCount = StatusHelper.countChangedFiles(status);
  // Work in progress sits on the checked out branch, so other branches' histories omit it.
  // A paused merge counts even with no files left, as it still has to be committed.
  const showUncommitted =
    (fileCount > 0 || Boolean(status.operation)) && (!ref || ref === status.branch);
  const { branch: currentBranch, headHash } = status;
  const entries = useMemo(() => interleaveStashes(commits ?? [], stashes), [commits, stashes]);
  const graph = useMemo(
    () =>
      layoutCommitGraph([
        ...(showUncommitted ? [uncommittedCommit(currentBranch, headHash)] : []),
        ...entries,
      ]),
    [entries, showUncommitted, currentBranch, headHash],
  );
  const graphRowOffset = showUncommitted ? 1 : 0;
  const tableRef = useRef(null);
  const { style, handleFor } = useResizableSizes(tableRef, 'history', COLUMN_LIMITS);
  const layoutRef = useRef(null);
  const pane = useResizableSizes(layoutRef, 'commit-pane', PANE_LIMITS);

  useEffect(() => {
    if (isSearching && !isFetchingNextPage) fetchNextPage();
  }, [isSearching, isFetchingNextPage, fetchNextPage]);

  // Ctrl+F (Cmd+F) searches the commits loaded here. `focusRequest` refocuses an open box.
  const [search, setSearch] = useState({ open: false, query: '', current: 0, focusRequest: 0 });
  const matches = useMemo(
    () => (search.open ? findMatches(entries, search.query) : []),
    [entries, search.open, search.query],
  );
  const currentMatch = matches.length > 0 ? Math.min(search.current, matches.length - 1) : -1;
  const currentMatchHash = matches[currentMatch];
  const matchSet = useMemo(() => new Set(matches), [matches]);
  const isFiltering = search.open && search.query.trim() !== '';
  const searchStateOf = (hash) => {
    if (!isFiltering) return undefined;
    if (hash === currentMatchHash) return 'current';
    return matchSet.has(hash) ? 'match' : 'dimmed';
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const isFind =
        event.key.toLowerCase() === 'f' &&
        KeyboardHelper.hasCommandKey(event) &&
        !event.shiftKey &&
        !event.altKey;
      if (!isFind || document.querySelector('.ant-modal')) return;
      event.preventDefault();
      setSearch((current) => ({ ...current, open: true, focusRequest: current.focusRequest + 1 }));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!currentMatchHash) return;
    const row = tableRef.current?.querySelector(`[data-hash="${currentMatchHash}"]`);
    row?.scrollIntoView({ block: 'center' });
  }, [currentMatchHash, search.focusRequest]);

  const stepMatch = (step) => {
    if (matches.length === 0) return;
    setSearch((current) => ({
      ...current,
      current: (currentMatch + step + matches.length) % matches.length,
    }));
  };

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

  /** Opens a commit, a stash or the uncommitted changes, leaving it open if it already is. */
  const openCommit = (hash) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('commit', hash);
        return next;
      },
      { replace: true },
    );
  };

  // Arrow Up and Down open the row above or below, from the list or with nothing focused.
  const scrollAreaRef = useRef(null);
  const stepThroughCommits = useEffectEvent((event) => {
    const step = KeyboardHelper.listStep(event);
    if (step === 0 || event.defaultPrevented || KeyboardHelper.isTyping(event)) return;
    const inList = scrollAreaRef.current?.contains(event.target);
    if (!inList && event.target !== document.body) return;
    if (document.querySelector('.ant-modal') || event.target.closest?.('[role="menu"]')) return;

    const hashes = [...(showUncommitted ? [UNCOMMITTED] : []), ...entries.map(({ hash }) => hash)];
    if (hashes.length === 0) return;
    event.preventDefault();
    const index = hashes.indexOf(selectedHash);
    const nextIndex = index === -1 ? 0 : index + step;
    if (nextIndex >= hashes.length && hasNextPage && !isFetchingNextPage) fetchNextPage();
    const nextHash = hashes[Math.min(Math.max(nextIndex, 0), hashes.length - 1)];
    if (nextHash === selectedHash) return;

    openCommit(nextHash);
    const row = tableRef.current?.querySelector(`[data-hash="${nextHash}"]`);
    row?.scrollIntoView({ block: 'nearest' });
    row?.querySelector('button[aria-pressed]')?.focus({ preventScroll: true });
  });
  useEffect(() => {
    window.addEventListener('keydown', stepThroughCommits);
    return () => window.removeEventListener('keydown', stepThroughCommits);
  }, []);

  /** Picks a branch from a commit's labels, as the sidebar would, and opens that commit. */
  const selectBranch = (branch, hash) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('focus', branch);
        next.delete('focusTag');
        next.set('commit', hash);
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
      <div className={styles.listArea}>
        {search.open && (
          <CommitSearch
            query={search.query}
            onQueryChange={(query) => setSearch((current) => ({ ...current, query, current: 0 }))}
            matchCount={matches.length}
            current={currentMatch}
            onStep={stepMatch}
            onClose={() => setSearch((current) => ({ ...current, open: false, query: '' }))}
            focusRequest={search.focusRequest}
            canSearchOlder={hasNextPage}
            isSearchingOlder={isFetchingNextPage}
            onSearchOlder={() => fetchNextPage()}
          />
        )}
        {/* Takes focus from clicks on rows, so arrow keys go on from the row clicked. */}
        <div ref={scrollAreaRef} className={styles.scrollArea} tabIndex={-1}>
          <header className={styles.header}>
            <h2 className={styles.heading}>{ref ?? allBranchesLabel}</h2>
            {ref && showAllBranches}
            {focusedName && !focusedHash && !isSearching && !isFetchingNextPage && (
              <>
                <span className={styles.focusNote}>
                  {focusedName} is not in the commits loaded here.
                </span>
                <Link to={paths.history(repository.id, focusedName)}>
                  <Button size="small">{focusedTag ? 'Show only this tag' : 'Show only this branch'}</Button>
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
                    searchState={searchStateOf(UNCOMMITTED)}
                  />
                )}
                {entries.map((commit, index) =>
                  commit.stash ? (
                    <StashRow
                      key={commit.hash}
                      entry={commit}
                      graphRow={graph.rows[index + graphRowOffset]}
                      columnCount={graph.columnCount}
                      selected={commit.hash === selectedHash}
                      onSelect={toggleCommit}
                      searchState={searchStateOf(commit.hash)}
                    />
                  ) : (
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
                      selectedBranch={focusedBranch}
                      pullRequests={pullRequests}
                      onSelect={toggleCommit}
                      onSelectBranch={selectBranch}
                      searchState={searchStateOf(commit.hash)}
                    />
                  ),
                )}
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
      </div>
      {selectedHash === UNCOMMITTED && (
        <WorkingTreePane onClose={() => toggleCommit(UNCOMMITTED)} resizeHandle={paneHandle} />
      )}
      {selectedStash && (
        <StashPane
          key={selectedStash}
          hash={selectedStash}
          onClose={() => toggleCommit(selectedHash)}
          resizeHandle={paneHandle}
        />
      )}
      {selectedHash && selectedHash !== UNCOMMITTED && !selectedStash && (
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
