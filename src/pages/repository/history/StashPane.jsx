import { CloseOutlined, MoreOutlined } from '@ant-design/icons';
import { Alert, Button, Dropdown, Empty, Spin } from 'antd';
import { useMemo, useState } from 'react';
import { RelativeTime } from '../../../components/RelativeTime.jsx';
import { useStashDetails, useStashDiff, useStashes } from '../../../queries/git.js';
import { DiffContent, DiffViewToggle, useDiffViewMode } from '../diff/DiffContent.jsx';
import { parseDiff } from '../diff/diffRows.js';
import { FileSection } from '../FileSection.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';
import { StatusHelper } from '../StatusHelper.js';
import { useStashMenu } from '../useStashMenu.js';
import styles from './CommitPane.module.css';
import { FilesAndDiff } from './FilesAndDiff.jsx';
import stashStyles from './StashPane.module.css';

function StashFileDiff({ hash, file }) {
  const { repository } = useRepositoryContext();
  const { view, changeView, fullFile } = useDiffViewMode();
  const { path, originalPath, untracked } = file;
  const { data, error, isPending } = useStashDiff(
    repository.id,
    hash,
    { path, originalPath, untracked },
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

const fileKey = ({ path, untracked }) => `${untracked ? 'untracked' : 'tracked'}:${path}`;

function StashBody({ hash }) {
  const { repository } = useRepositoryContext();
  const { data, error, isPending } = useStashDetails(repository.id, hash);
  const [selectedKey, setSelectedKey] = useState(null);

  if (isPending) return <Spin className="centered" />;
  if (error) return <Alert type="error" showIcon title={error.message} />;

  const { files } = data;
  const tracked = files.filter((file) => !file.untracked);
  const untracked = files.filter((file) => file.untracked);
  const file = files.find((candidate) => fileKey(candidate) === selectedKey) ?? files[0];
  if (!file) return <Empty className="centered" description="This stash holds no changes" />;

  const section = (title, list) => (
    <FileSection
      title={title}
      files={list}
      isSelected={(candidate) => fileKey(candidate) === fileKey(file)}
      onSelect={(candidate) => setSelectedKey(fileKey(candidate))}
      renderActions={() => null}
    />
  );

  return (
    <FilesAndDiff
      files={
        <>
          {section('Changed', tracked)}
          {section('Untracked', untracked)}
        </>
      }
    >
      <StashFileDiff hash={hash} file={file} />
    </FilesAndDiff>
  );
}

function StashActions({ stash }) {
  const { status, run, isBusy } = useRepositoryContext();
  const items = useStashMenu(stash);
  const blocked = StatusHelper.isBlocked(status, isBusy);

  return (
    <div className={stashStyles.actions}>
      <Button size="small" disabled={blocked} onClick={() => run('stashApply', { ref: stash.ref })}>
        Apply
      </Button>
      <Button size="small" disabled={blocked} onClick={() => run('stashPop', { ref: stash.ref })}>
        Pop
      </Button>
      <Dropdown menu={{ items }} trigger={['click']}>
        <Button size="small" icon={<MoreOutlined />} aria-label="More stash actions" />
      </Dropdown>
    </div>
  );
}

/** A stash's files and diffs. Mount it with a key per stash, to reset the chosen file. */
export function StashPane({ hash, onClose, resizeHandle }) {
  const { repository } = useRepositoryContext();
  const { data: stashes, isPending } = useStashes(repository.id);
  const stash = stashes?.find((candidate) => candidate.hash === hash);

  const renderContent = () => {
    if (isPending) return <Spin className="centered" />;
    // Popped or deleted since, perhaps from a terminal.
    if (!stash) return <Empty className="centered" description="This stash is gone" />;
    return (
      <>
        <header className={styles.header}>
          <h3 className={styles.subject}>{stash.message}</h3>
          <p className={styles.meta}>
            Stash{stash.branch && ` on ${stash.branch}`} · <RelativeTime date={stash.date} /> ·{' '}
            <code className={styles.hash}>{stash.ref}</code>
          </p>
          <StashActions stash={stash} />
        </header>
        <StashBody hash={hash} />
      </>
    );
  };

  return (
    <aside className={styles.pane} aria-label="Stash details">
      <Button
        className={styles.close}
        type="text"
        size="small"
        icon={<CloseOutlined />}
        aria-label="Close stash details"
        onClick={onClose}
      />
      {renderContent()}
      {resizeHandle}
    </aside>
  );
}
