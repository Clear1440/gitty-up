import { CloseOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Spin } from 'antd';
import { useMemo, useState } from 'react';
import { RelativeTime } from '../../../components/RelativeTime.jsx';
import { useCommitDetails, useCommitDiff } from '../../../queries/git.js';
import { DiffContent, DiffViewToggle, useDiffViewMode } from '../diff/DiffContent.jsx';
import { parseDiff } from '../diff/diffRows.js';
import { FileSection } from '../FileSection.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';
import styles from './CommitPane.module.css';
import { FilesAndDiff } from './FilesAndDiff.jsx';

function CommitFileDiff({ hash, file }) {
  const { repository } = useRepositoryContext();
  const { view, changeView, fullFile } = useDiffViewMode();
  const { path, originalPath } = file;
  const { data, error, isPending } = useCommitDiff(
    repository.id,
    hash,
    { path, originalPath },
    { fullFile },
  );
  const hunks = useMemo(() => parseDiff(data?.diff ?? ''), [data]);

  const renderContent = () => {
    if (isPending) return <Spin className="centered" />;
    if (error) return <Alert type="error" showIcon title={error.message} />;
    if (!data.diff.trim()) return <Empty className="centered" description="No text changes" />;
    return <DiffContent diff={data.diff} hunks={hunks} view={view} />;
  };

  return (
    <>
      <div className={styles.toolbar}>
        <DiffViewToggle view={view} onChange={changeView} />
      </div>
      <div className={styles.diff}>{renderContent()}</div>
    </>
  );
}

function CommitBody({ commit }) {
  const [selectedPath, setSelectedPath] = useState(null);
  const { files } = commit;
  const file = files.find(({ path }) => path === selectedPath) ?? files[0];

  if (!file) return <Empty className="centered" description="This commit changed no files" />;

  return (
    <FilesAndDiff
      files={
        <FileSection
          title="Files"
          files={files}
          isSelected={({ path }) => path === file.path}
          onSelect={({ path }) => setSelectedPath(path)}
          renderActions={() => null}
        />
      }
    >
      <CommitFileDiff hash={commit.hash} file={file} />
    </FilesAndDiff>
  );
}

/** A commit's details and diffs. Mount it with a key per commit, to reset the chosen file. */
export function CommitPane({ hash, onClose, resizeHandle }) {
  const { repository } = useRepositoryContext();
  const { data: commit, error, isPending } = useCommitDetails(repository.id, hash);

  const renderContent = () => {
    if (isPending) return <Spin className="centered" />;
    if (error) return <Alert type="error" showIcon title={error.message} />;

    // The subject is the first paragraph of the message, and the rest is the body.
    const body = commit.message.slice(commit.subject.length).trim();
    return (
      <>
        <header className={styles.header}>
          <h3 className={styles.subject}>{commit.subject}</h3>
          {body && <p className={styles.body}>{body}</p>}
          <p className={styles.meta}>
            {commit.repository && `${commit.repository} · `}
            {commit.author} · <RelativeTime date={commit.date} /> ·{' '}
            <code className={styles.hash} title={commit.hash}>
              {commit.shortHash}
            </code>
          </p>
          {commit.parents.length > 1 && (
            <p className={styles.meta}>Merge commit, compared with its first parent.</p>
          )}
        </header>
        <CommitBody commit={commit} />
      </>
    );
  };

  return (
    <aside className={styles.pane} aria-label="Commit details">
      <Button
        className={styles.close}
        type="text"
        size="small"
        icon={<CloseOutlined />}
        aria-label="Close commit details"
        onClick={onClose}
      />
      {renderContent()}
      {resizeHandle}
    </aside>
  );
}
