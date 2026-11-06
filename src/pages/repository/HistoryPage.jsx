import { Button, Empty, Result, Spin, Tag } from 'antd';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { paths } from '../../paths.js';
import { useCommits } from '../../queries/git.js';
import { layoutCommitGraph } from './history/commitGraph.js';
import { CommitGraphCell } from './history/CommitGraphCell.jsx';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './HistoryPage.module.css';

const REF_TAG_STYLES = { head: styles.refHead, branch: styles.refBranch, tag: styles.refTag };

function CommitRow({ commit, graphRow, columnCount }) {
  return (
    <li className={styles.commit}>
      <CommitGraphCell
        row={graphRow}
        columnCount={columnCount}
        isHead={commit.refs.some((ref) => ref.type === 'head')}
        isMerge={commit.parents.length > 1}
      />
      <div className={styles.main}>
        <p className={styles.subject} title={commit.subject}>
          {commit.subject}
        </p>
        <p className={styles.meta}>
          {commit.author} · <RelativeTime date={commit.date} />
        </p>
      </div>
      <div className={styles.refs}>
        {commit.refs.map((ref) => (
          <Tag key={ref.name} className={REF_TAG_STYLES[ref.type]} title={ref.name}>
            {ref.name}
          </Tag>
        ))}
      </div>
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
