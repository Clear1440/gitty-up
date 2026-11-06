import { Button, Empty, Result, Spin, Tag } from 'antd';
import { Link, useSearchParams } from 'react-router';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { paths } from '../../paths.js';
import { useCommits } from '../../queries/git.js';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './HistoryPage.module.css';

const REF_TAG_STYLES = { head: styles.refHead, branch: styles.refBranch, tag: styles.refTag };

function CommitRow({ commit }) {
  return (
    <li className={styles.commit}>
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
          <Tag key={ref.name} className={REF_TAG_STYLES[ref.type]}>
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
  const { repository, status } = useRepositoryContext();
  const [searchParams] = useSearchParams();
  const ref = searchParams.get('ref') ?? undefined;
  const { data: commits, error, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useCommits(repository.id, ref);

  if (isPending) return <Spin className="centered" />;
  if (error) {
    return (
      <Result
        status="warning"
        title={`Could not read ${ref ?? 'history'}`}
        subTitle={error.message}
        extra={
          <Link to={paths.history(repository.id)}>
            <Button>Show current branch</Button>
          </Link>
        }
      />
    );
  }
  if (commits.length === 0) {
    return <Empty className="centered" description="No commits yet" />;
  }

  return (
    <div className={styles.scrollArea}>
      <h2 className={styles.heading}>{ref ?? status.branch ?? 'HEAD'}</h2>
      <ol className={styles.list}>
        {commits.map((commit) => (
          <CommitRow key={commit.hash} commit={commit} />
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
