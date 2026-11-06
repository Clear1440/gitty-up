import {
  CheckOutlined,
  CloseOutlined,
  MinusOutlined,
  PlusOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { Button, Empty, Popconfirm, Tooltip } from 'antd';
import { useState } from 'react';
import { CommitPanel } from '../CommitPanel.jsx';
import { DiffView } from '../DiffView.jsx';
import { FileSection } from '../FileSection.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';
import styles from './CommitPane.module.css';

function IconAction({ label, icon, ...buttonProps }) {
  return (
    <Tooltip title={label}>
      <Button type="text" size="small" icon={icon} aria-label={label} {...buttonProps} />
    </Tooltip>
  );
}

const toSelection = (file, staged) => ({
  path: file.path,
  staged,
  untracked: file.status === 'untracked',
});

/**
 * The file to show: the chosen one, or the same path in the other area once it has
 * been staged or unstaged, or else whichever file comes first.
 */
function findSelectedFile({ staged, unstaged, conflicted }, choice) {
  const areas = [
    { files: [...conflicted, ...unstaged], isStaged: false },
    { files: staged, isStaged: true },
  ];
  if (choice?.staged) areas.reverse();

  for (const { files, isStaged } of areas) {
    const file = files.find(({ path }) => path === choice?.path);
    if (file) return toSelection(file, isStaged);
  }
  for (const { files, isStaged } of areas) {
    if (files.length > 0) return toSelection(files[0], isStaged);
  }
  return null;
}

function WorkingTreeFiles({ selected, onSelect }) {
  const { status, run, isBusy } = useRepositoryContext();
  const { staged, unstaged, conflicted } = status;

  const select = (isStaged) => (file) => onSelect({ path: file.path, staged: isStaged });
  const isSelected = (isStaged) => (file) =>
    selected.path === file.path && selected.staged === isStaged;

  return (
    <div className={styles.files}>
      <FileSection
        title="Conflicted"
        files={conflicted}
        isSelected={isSelected(false)}
        onSelect={select(false)}
        renderActions={(file) => (
          <IconAction
            label="Mark as resolved"
            icon={<CheckOutlined />}
            disabled={isBusy}
            onClick={() => run('stage', { paths: [file.path] })}
          />
        )}
      />
      <FileSection
        title="Unstaged"
        files={unstaged}
        isSelected={isSelected(false)}
        onSelect={select(false)}
        headerAction={
          <Button size="small" type="text" disabled={isBusy} onClick={() => run('stage')}>
            Stage all
          </Button>
        }
        renderActions={(file) => (
          <>
            <Popconfirm
              title="Discard these changes?"
              description={`${file.path} goes back to its last commit. This cannot be undone.`}
              okText="Discard"
              okButtonProps={{ danger: true }}
              onConfirm={() => run('discard', { paths: [file.path] })}
            >
              <IconAction label="Discard" icon={<UndoOutlined />} disabled={isBusy} />
            </Popconfirm>
            <IconAction
              label="Stage"
              icon={<PlusOutlined />}
              disabled={isBusy}
              onClick={() => run('stage', { paths: [file.path] })}
            />
          </>
        )}
      />
      <FileSection
        title="Staged"
        files={staged}
        isSelected={isSelected(true)}
        onSelect={select(true)}
        headerAction={
          <Button size="small" type="text" disabled={isBusy} onClick={() => run('unstage')}>
            Unstage all
          </Button>
        }
        renderActions={(file) => (
          <IconAction
            label="Unstage"
            icon={<MinusOutlined />}
            disabled={isBusy}
            onClick={() => run('unstage', { paths: [file.path] })}
          />
        )}
      />
    </div>
  );
}

/** The uncommitted changes: the commit pane's counterpart for work not yet in a commit. */
export function WorkingTreePane({ onClose, resizeHandle }) {
  const { status } = useRepositoryContext();
  const [choice, setChoice] = useState(null);
  const selected = findSelectedFile(status, choice);

  return (
    <aside className={styles.pane} aria-label="Uncommitted changes">
      <Button
        className={styles.close}
        type="text"
        size="small"
        icon={<CloseOutlined />}
        aria-label="Close uncommitted changes"
        onClick={onClose}
      />
      <header className={styles.header}>
        <h3 className={styles.subject}>Uncommitted changes</h3>
        <p className={styles.meta}>
          {status.branch ? `On ${status.branch}` : `Detached at ${status.headHash?.slice(0, 7)}`}
        </p>
      </header>
      {selected ? (
        <>
          <WorkingTreeFiles selected={selected} onSelect={setChoice} />
          <DiffView file={selected} />
        </>
      ) : (
        <div className={styles.diff}>
          <Empty className="centered" description="No changes. The working tree is clean." />
        </div>
      )}
      <CommitPanel onClean={onClose} />
      {resizeHandle}
    </aside>
  );
}
