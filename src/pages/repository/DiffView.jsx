import { Alert, Empty, Spin } from 'antd';
import clsx from 'clsx';
import { useDiff } from '../../queries/git.js';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './DiffView.module.css';

const MAX_LINES = 3_000;

function lineClass(line) {
  if (line.startsWith('@@')) return styles.hunk;
  if (line.startsWith('+')) return styles.added;
  if (line.startsWith('-')) return styles.deleted;
  return null;
}

/** Drops the file header, unless that is all there is, as with a binary file. */
function diffBody(diff) {
  const lines = diff.split('\n');
  const firstHunk = lines.findIndex((line) => line.startsWith('@@'));
  return firstHunk === -1 ? lines : lines.slice(firstHunk);
}

function DiffLines({ diff }) {
  const lines = diffBody(diff);
  return (
    <>
      <pre className={styles.diff}>
        {lines.slice(0, MAX_LINES).map((line, index) => (
          <div key={index} className={clsx(styles.line, lineClass(line))}>
            {line || ' '}
          </div>
        ))}
      </pre>
      {lines.length > MAX_LINES && (
        <p className={styles.truncated}>
          Showing the first {MAX_LINES.toLocaleString()} of {lines.length.toLocaleString()} lines.
        </p>
      )}
    </>
  );
}

export function DiffView({ file }) {
  const { repository } = useRepositoryContext();
  const { data: diff, error, isPending } = useDiff(repository.id, file);

  const renderContent = () => {
    if (!file) return <Empty className="centered" description="Select a file to see its changes" />;
    if (isPending) return <Spin className="centered" />;
    if (error) return <Alert type="error" showIcon title={error.message} />;
    if (!diff.trim()) return <Empty className="centered" description="No text changes" />;
    return <DiffLines diff={diff} />;
  };

  return <div className={styles.column}>{renderContent()}</div>;
}
