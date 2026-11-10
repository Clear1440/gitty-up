import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  FileTextOutlined,
  InboxOutlined,
  MinusOutlined,
  PlusOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { App, Button, Empty, Popconfirm, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { paths } from '../../../paths.js';
import { EMPTY_SELECTION, clickSelection, selectedInOrder } from '../../home/selection.js';
import { TextHelper } from '../../../utils/TextHelper.js';
import { CommitHelper } from '../CommitHelper.js';
import { CommitPanel } from '../CommitPanel.jsx';
import { DiffView } from '../DiffView.jsx';
import { FileSection } from '../FileSection.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';
import { StatusHelper } from '../StatusHelper.js';
import { usePatchActions } from '../usePatchActions.js';
import styles from './CommitPane.module.css';
import { FilesAndDiff } from './FilesAndDiff.jsx';
import stashStyles from './StashPane.module.css';
import { useFileMenu } from './useFileMenu.js';

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

const NO_PICKS = { area: null, ...EMPTY_SELECTION };

/**
 * Files picked with shift and ctrl clicks, as on the repositories page. A pick stays
 * in its own list: picking in another list starts over there.
 */
function useFilePicks(status) {
  const [picks, setPicks] = useState(NO_PICKS);
  const listFor = (area) => status[area].map((file) => file.path);
  const pickedIn = (area) =>
    picks.area === area ? selectedInOrder(picks, listFor(area)) : [];

  useEffect(() => {
    if (picks.ids.length < 2) return undefined;
    const clearOnEscape = (event) => {
      if (event.key === 'Escape') setPicks(NO_PICKS);
    };
    document.addEventListener('keydown', clearOnEscape);
    return () => document.removeEventListener('keydown', clearOnEscape);
  }, [picks.ids.length]);

  const click = (area, path, event) => {
    const toggle = event.ctrlKey || event.metaKey;
    const range = event.shiftKey;
    setPicks((current) => {
      if (!(toggle || range) || current.area !== area) return { area, ids: [path], anchor: path };
      return { area, ...clickSelection(current, path, listFor(area), { toggle, range }) };
    });
  };

  return { pickedIn, click };
}

function WorkingTreeFiles({ selected, onSelect }) {
  const { repository, status, run, isBusy } = useRepositoryContext();
  const navigate = useNavigate();
  const { staged, unstaged, conflicted } = status;
  const picks = useFilePicks(status);
  const menus = useFileMenu();

  const select = (area, isStaged) => (file, event) => {
    picks.click(area, file.path, event);
    onSelect({ path: file.path, staged: isStaged });
  };
  const isSelected = (area, isStaged) => (file) => {
    const picked = picks.pickedIn(area);
    if (picked.length > 1) return picked.includes(file.path);
    return selected.path === file.path && selected.staged === isStaged;
  };
  /** The files a right-click acts on: every pick, if it was on one of them. */
  const targetsFor = (area, file) => {
    const picked = picks.pickedIn(area);
    if (!picked.includes(file.path)) return [file];
    return status[area].filter((candidate) => picked.includes(candidate.path));
  };

  return (
    <>
      <FileSection
        title="Conflicted"
        files={conflicted}
        isSelected={isSelected('conflicted', false)}
        onSelect={select('conflicted', false)}
        getMenuItems={(file) => menus.copyItems([file])}
        renderActions={(file) => (
          <>
            <Button
              size="small"
              type="primary"
              ghost
              disabled={isBusy}
              onClick={() => navigate(paths.resolveConflict(repository.id, file.path))}
            >
              Resolve conflict
            </Button>
            <IconAction
              label="Mark as resolved as it is"
              icon={<CheckOutlined />}
              disabled={isBusy}
              onClick={() => run('stage', { paths: [file.path] })}
            />
          </>
        )}
      />
      <FileSection
        title="Unstaged"
        files={unstaged}
        isSelected={isSelected('unstaged', false)}
        onSelect={select('unstaged', false)}
        getMenuItems={(file) => menus.unstagedItems(targetsFor('unstaged', file))}
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
        isSelected={isSelected('staged', true)}
        onSelect={select('staged', true)}
        getMenuItems={(file) => menus.stagedItems(targetsFor('staged', file))}
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
    </>
  );
}

/** The uncommitted changes: the commit pane's counterpart for work not yet in a commit. */
export function WorkingTreePane({ onClose, resizeHandle }) {
  const { repository, status, run, openDialog, isBusy, pendingAction } = useRepositoryContext();
  const { savePatch } = usePatchActions();
  const { modal } = App.useApp();
  const fileCount = StatusHelper.countChangedFiles(status);
  const hasFiles = fileCount > 0;

  const confirmDiscardAll = () =>
    modal.confirm({
      title: `Discard all changes to ${TextHelper.countOf(fileCount, 'file')}?`,
      content: repository.isMono
        ? 'In every repository here, staged and unstaged changes are thrown away and new files deleted. Ignored files stay. This cannot be undone.'
        : 'Staged and unstaged changes are thrown away and new files deleted. Ignored files stay. This cannot be undone.',
      okText: 'Discard all',
      okButtonProps: { danger: true },
      focusable: { autoFocusButton: 'cancel' },
      onOk: () => run('discardAll'),
    });
  const [choice, setChoice] = useState(null);
  const selected = findSelectedFile(status, choice);
  const place = status.branch
    ? `On ${status.branch}`
    : `Detached at ${CommitHelper.shortHash(status.headHash)}`;
  const memberCount = status.mono?.members.length ?? 0;

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
          {place}
          {status.mono && ` across ${TextHelper.countOf(memberCount, 'repository', 'repositories')}`}
        </p>
        {hasFiles && (
          <div className={stashStyles.actions}>
            {/* Stashes and patches belong to one repository, so a mono repo leaves them out. */}
            {!repository.isMono && (
              <>
                <Button
                  size="small"
                  icon={<InboxOutlined />}
                  loading={pendingAction === 'stash'}
                  disabled={isBusy || Boolean(status.operation)}
                  onClick={() => openDialog('stash')}
                >
                  Stash all changes
                </Button>
                <Button
                  size="small"
                  icon={<FileTextOutlined />}
                  onClick={() => savePatch({ source: 'uncommitted' })}
                >
                  Save as patch
                </Button>
              </>
            )}
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={pendingAction === 'discardAll'}
              disabled={isBusy || Boolean(status.operation)}
              title={status.operation ? `Abort the ${status.operation} instead` : undefined}
              onClick={confirmDiscardAll}
            >
              Discard all…
            </Button>
          </div>
        )}
      </header>
      {selected ? (
        <FilesAndDiff files={<WorkingTreeFiles selected={selected} onSelect={setChoice} />}>
          <DiffView file={selected} />
        </FilesAndDiff>
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
