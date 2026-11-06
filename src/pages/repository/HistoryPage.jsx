import { Button, Empty, Result, Spin, Tag } from 'antd';
import { useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { ResizeHandle } from '../../components/ResizeHandle.jsx';
import { useResizableSizes } from '../../components/useResizableSizes.js';
import { paths } from '../../paths.js';
import { useCommits } from '../../queries/git.js';
import { layoutCommitGraph } from './history/commitGraph.js';
import { CommitGraphCell } from './history/CommitGraphCell.jsx';
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

function CommitRow({ commit, graphRow, columnCount }) {
  return (
    <li className={styles.commit}>
      <div className={styles.tree}>
        <CommitGraphCell
          row={graphRow}
          columnCount={columnCount}
          isHead={commit.refs.some((ref) => ref.type === 'head')}
          isMerge={commit.parents.length > 1}
        />
      </div>
      <div className={styles.refs}>
        {commit.refs.map((ref) => (
          <Tag key={ref.name} className={REF_TAG_STYLES[ref.type]} title={ref.name}>
            {ref.name}
          </Tag>
        ))}
      </div>
      <span className={styles.author} title={commit.author}>
        {commit.author}
      </span>
      <p className={styles.subject} title={commit.subject}>
        {commit.subject}
      </p>
      <RelativeTime className={styles.time} date={commit.date} />
      <code className={styles.hash} title={commit.hash}>
        {commit.shortHash}
      </code>
    </li>
  );
}

export function HistoryPage() {
  const { repository } = useRepositoryContext();
  const [searchParams] = useSearchParams();
  const ref = searchParams.get('ref') ?? undefined;
  const { data: commits, error, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useCommits(repository.id, ref);
  const graph = useMemo(() => layoutCommitGraph(commits ?? []), [commits]);
  const tableRef = useRef(null);
  const { style, handleFor } = useResizableSizes(tableRef, 'history', COLUMN_LIMITS);

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
  if (commits.length === 0) {
    return <Empty className="centered" description="No commits yet" />;
  }

  return (
    <div className={styles.scrollArea}>
      <header className={styles.header}>
        <h2 className={styles.heading}>{ref ?? 'All branches'}</h2>
        {ref && showAllBranches}
      </header>
      <div ref={tableRef} className={styles.table} style={style}>
        <ColumnHeadings handleFor={handleFor} />
        <ol className={styles.list}>
          {commits.map((commit, index) => (
            <CommitRow
              key={commit.hash}
              commit={commit}
              graphRow={graph.rows[index]}
              columnCount={graph.columnCount}
            />
          ))}
        </ol>
      </div>
      {hasNextPage && (
        <div className={styles.loadMore}>
          <Button loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
