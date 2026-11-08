import {
  BranchesOutlined,
  CloseOutlined,
  CloudDownloadOutlined,
  DisconnectOutlined,
  EditOutlined,
  ExportOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  MoreOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { App, Button, Dropdown } from 'antd';
import clsx from 'clsx';
import { useState } from 'react';
import { Link } from 'react-router';
import { AheadBehind } from '../../components/AheadBehind.jsx';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { paths } from '../../paths.js';
import {
  useCreateGroup,
  useSetRepositoryGroup,
  useUnlinkRepository,
} from '../../queries/repositories.js';
import { useTabs } from '../../tabs/TabsContext.jsx';
import { KeyboardHelper } from '../../utils/KeyboardHelper.js';
import { GroupNameDialog } from './GroupNameDialog.jsx';
import styles from './RepositoryRow.module.css';
import { CloneRepositoryDialog, LocateRepositoryDialog } from './StubDialogs.jsx';
import { useRepositorySelectionContext } from './useRepositorySelection.js';

const MIDDLE_BUTTON = 1;

function Identity({ repository }) {
  const location = repository.path ?? repository.remoteUrl;
  return (
    <div className={styles.identity}>
      <h3 className={styles.title}>{repository.name}</h3>
      <p className={styles.path} title={location}>
        {location}
      </p>
    </div>
  );
}

function BranchLabel({ summary }) {
  return (
    <span className={styles.branch}>
      <BranchesOutlined /> {summary.detached ? 'detached HEAD' : summary.branch}
    </span>
  );
}

function RowStatus({ summary }) {
  return (
    <>
      <div className={styles.meta}>
        <BranchLabel summary={summary} />
        <span className={styles.syncState}>
          <AheadBehind ahead={summary.ahead} behind={summary.behind} />
        </span>
        {summary.changeCount > 0 && (
          <span className={styles.changes}>
            <EditOutlined /> {summary.changeCount}
          </span>
        )}
      </div>
      {summary.lastCommit ? (
        <p className={styles.lastCommit}>
          <span className={styles.commitSubject}>{summary.lastCommit.subject}</span>
          <RelativeTime className={styles.commitTime} date={summary.lastCommit.date} />
        </p>
      ) : (
        <p className={styles.lastCommit}>No commits yet</p>
      )}
    </>
  );
}

/** A repository known only by its URL. It has no folder to open until one is chosen. */
function StubBody({ repository }) {
  const [dialog, setDialog] = useState(null);
  const closeDialog = () => setDialog(null);

  return (
    <div className={styles.body}>
      <Identity repository={repository} />
      <div className={styles.stubActions}>
        <Button
          type="primary"
          size="small"
          icon={<CloudDownloadOutlined />}
          onClick={() => setDialog('clone')}
        >
          Clone repository
        </Button>
        <Button size="small" icon={<FolderOpenOutlined />} onClick={() => setDialog('locate')}>
          Locate in file system
        </Button>
      </div>
      {dialog === 'clone' && (
        <CloneRepositoryDialog repository={repository} onClose={closeDialog} />
      )}
      {dialog === 'locate' && (
        <LocateRepositoryDialog repository={repository} onClose={closeDialog} />
      )}
    </div>
  );
}

export function RepositoryRow({ repository, groups }) {
  const { modal, notification } = App.useApp();
  const unlink = useUnlinkRepository();
  const setGroup = useSetRepositoryGroup();
  const createGroup = useCreateGroup();
  const [naming, setNaming] = useState(false);
  const { closeTab, openTab } = useTabs();
  const selection = useRepositorySelectionContext();
  const isStub = repository.path === null;
  const isSelected = selection.isSelected(repository.id);

  const openInBackground = (event) => {
    event.preventDefault();
    openTab(repository.id, paths.repository(repository.id));
  };

  const handleClick = (event) => {
    const toggle = KeyboardHelper.hasCommandKey(event);
    if (toggle || event.shiftKey) {
      event.preventDefault();
      selection.click(repository.id, { toggle, range: event.shiftKey });
    } else {
      selection.clear();
    }
  };

  const selectedCount = selection.selectedIds.length;
  const contextItems = [
    {
      key: 'open',
      label: selectedCount > 1 ? `Open ${selectedCount} repositories in tabs` : 'Open in new tab',
      icon: <ExportOutlined />,
      onClick: selection.openSelected,
    },
    { key: 'clear', label: 'Clear selection', icon: <CloseOutlined />, onClick: selection.clear },
  ];

  const moveToGroup = async (groupId) => {
    try {
      await setGroup.mutateAsync({ repositoryId: repository.id, groupId });
    } catch (error) {
      notification.error({ title: 'Could not move the repository', description: error.message });
    }
  };

  const moveToNewGroup = async (name) => {
    const group = await createGroup.mutateAsync(name);
    await setGroup.mutateAsync({ repositoryId: repository.id, groupId: group.id });
  };

  const confirmUnlink = () => {
    modal.confirm({
      title: `Unlink ${repository.name}?`,
      content: isStub
        ? 'It leaves this list. Nothing on the remote changes.'
        : 'It leaves this list. The folder and its files stay on disk.',
      okText: 'Unlink',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await unlink.mutateAsync(repository.id);
          closeTab(repository.id);
        } catch (error) {
          notification.error({ title: 'Unlink failed', description: error.message });
        }
      },
    });
  };

  const groupItems = [
    ...groups.map((group) => ({
      key: `group-${group.id}`,
      label: group.name,
      disabled: group.id === repository.groupId,
      onClick: () => moveToGroup(group.id),
    })),
    ...(groups.length > 0 ? [{ type: 'divider' }] : []),
    ...(repository.groupId
      ? [{ key: 'ungroup', label: 'Remove from group', onClick: () => moveToGroup(null) }]
      : []),
    { key: 'new-group', label: 'New group…', onClick: () => setNaming(true) },
  ];

  const menuItems = [
    { key: 'group', label: 'Move to group', icon: <FolderOutlined />, children: groupItems },
    { key: 'unlink', label: 'Unlink', icon: <DisconnectOutlined />, onClick: confirmUnlink },
  ];

  const row = (
    <article
      className={clsx(
        styles.row,
        !repository.available && styles.unavailable,
        isSelected && styles.selected,
      )}
    >
      {isStub ? (
        <StubBody repository={repository} />
      ) : (
        <Link
          className={clsx(styles.body, styles.link)}
          to={paths.repository(repository.id)}
          onClick={handleClick}
          onAuxClick={(event) => {
            if (event.button === MIDDLE_BUTTON) openInBackground(event);
          }}
          onMouseDown={(event) => {
            // Stops the browser's autoscroll and shift-click text selection.
            if (event.button === MIDDLE_BUTTON || event.shiftKey) event.preventDefault();
          }}
        >
          <Identity repository={repository} />
          {repository.available ? (
            <RowStatus summary={repository.summary} />
          ) : (
            <p className={styles.missing}>
              <WarningOutlined /> Folder not found
            </p>
          )}
        </Link>
      )}
      <Dropdown menu={{ items: menuItems }} trigger={['click']}>
        <Button
          className={styles.menu}
          type="text"
          icon={<MoreOutlined />}
          aria-label={`Options for ${repository.name}`}
        />
      </Dropdown>
      {naming && (
        <GroupNameDialog
          title="New group"
          okText="Create and move"
          onSave={moveToNewGroup}
          onClose={() => setNaming(false)}
        />
      )}
    </article>
  );

  if (isStub) return row;
  return (
    <Dropdown
      menu={{ items: contextItems }}
      trigger={['contextMenu']}
      // Right-clicking a row outside the selection picks just that row, as file managers do.
      onOpenChange={(open) => open && !isSelected && selection.selectOnly(repository.id)}
    >
      {row}
    </Dropdown>
  );
}
