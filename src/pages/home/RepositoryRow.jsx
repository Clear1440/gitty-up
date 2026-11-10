import {
  BranchesOutlined,
  CheckOutlined,
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
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { AheadBehind } from '../../components/AheadBehind.jsx';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { paths } from '../../paths.js';
import {
  useCreateGroup,
  useSetRepositoryGroups,
  useUnlinkRepository,
} from '../../queries/repositories.js';
import { useTabs } from '../../tabs/TabsContext.jsx';
import { KeyboardHelper } from '../../utils/KeyboardHelper.js';
import { colorValueOf } from './groupColors.js';
import { groupIdsOf, isInGroup, toggleGroup, UNGROUPED } from './groupMembership.js';
import { GroupNameDialog } from './GroupNameDialog.jsx';
import styles from './RepositoryRow.module.css';
import { CloneRepositoryDialog, LocateRepositoryDialog } from './StubDialogs.jsx';
import { DRAG_TYPE, useRepositoryList } from './useRepositoryList.js';
import { useRepositorySelectionContext } from './useRepositorySelection.js';

const MIDDLE_BUTTON = 1;

function Identity({ repository, condensed }) {
  const location = repository.path ?? repository.remoteUrl;
  return (
    <div className={styles.identity} title={condensed ? location : undefined}>
      <h3 className={styles.title}>{repository.name}</h3>
      {!condensed && (
        <p className={styles.path} title={location}>
          {location}
        </p>
      )}
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

function RowStatus({ summary, condensed }) {
  const meta = (
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
  );

  // One line: the last commit shows only as its time, with the subject on hover.
  if (condensed) {
    return (
      <>
        {meta}
        {summary.lastCommit ? (
          <span className={styles.lastCommit} title={summary.lastCommit.subject}>
            <RelativeTime className={styles.commitTime} date={summary.lastCommit.date} />
          </span>
        ) : (
          <span className={styles.lastCommit}>No commits</span>
        )}
      </>
    );
  }

  return (
    <>
      {meta}
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
function StubBody({ repository, condensed }) {
  const [dialog, setDialog] = useState(null);
  const closeDialog = () => setDialog(null);

  return (
    <div className={styles.body}>
      <Identity repository={repository} condensed={condensed} />
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

/** A group's name in a menu, after a dot in its color when it has one. */
function GroupLabel({ group }) {
  const color = colorValueOf(group.color);
  return (
    <span className={styles.groupLabel}>
      {group.name}
      {color && <span className={styles.groupDot} style={{ background: color }} />}
    </span>
  );
}

/**
 * One repository on the home page. `sectionId` is the section it shows in, which
 * matters when it is dragged out: a repository in many groups shows in each.
 * `color` is that section's group color, shown as a bar down the row's edge.
 */
export function RepositoryRow({ repository, groups, sectionId = UNGROUPED, color = null }) {
  const { modal, notification } = App.useApp();
  const unlink = useUnlinkRepository();
  const setGroups = useSetRepositoryGroups();
  const createGroup = useCreateGroup();
  const [naming, setNaming] = useState(false);
  const { closeTab, openTab } = useTabs();
  const selection = useRepositorySelectionContext();
  const { condensed, drag, setDrag } = useRepositoryList();
  const rowRef = useRef(null);
  const isStub = repository.path === null;
  const isSelected = selection.isSelected(repository.id);
  const canDrag = groups.length > 0;
  const isDragging =
    drag?.kind === 'repository' &&
    drag.repositoryId === repository.id &&
    drag.fromSectionId === sectionId;

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

  const handleDragStart = (event) => {
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData(DRAG_TYPE, repository.id);
    // Drag the whole row, not just the link text the pointer happened to be on.
    const rect = rowRef.current.getBoundingClientRect();
    event.dataTransfer.setDragImage(
      rowRef.current,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    setDrag({ kind: 'repository', repositoryId: repository.id, fromSectionId: sectionId });
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

  const saveGroups = async (groupIds) => {
    try {
      await setGroups.mutateAsync({ repositoryId: repository.id, groupIds });
    } catch (error) {
      notification.error({ title: 'Could not change the groups', description: error.message });
    }
  };

  const addToNewGroup = async (name) => {
    const group = await createGroup.mutateAsync(name);
    await setGroups.mutateAsync({
      repositoryId: repository.id,
      groupIds: [...groupIdsOf(repository), group.id],
    });
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

  const hasGroups = groupIdsOf(repository).length > 0;
  const groupItems = [
    ...groups.map((group) => ({
      key: `group-${group.id}`,
      label: <GroupLabel group={group} />,
      icon: isInGroup(repository, group.id) ? <CheckOutlined /> : <span className={styles.blank} />,
      onClick: () => saveGroups(toggleGroup(repository, group.id)),
    })),
    ...(groups.length > 0 ? [{ type: 'divider' }] : []),
    ...(hasGroups
      ? [{ key: 'ungroup', label: 'Remove from all groups', onClick: () => saveGroups([]) }]
      : []),
    { key: 'new-group', label: 'New group…', onClick: () => setNaming(true) },
  ];

  const menuItems = [
    { key: 'groups', label: 'Groups', icon: <FolderOutlined />, children: groupItems },
    { key: 'unlink', label: 'Unlink', icon: <DisconnectOutlined />, onClick: confirmUnlink },
  ];

  const row = (
    <article
      ref={rowRef}
      className={clsx(
        styles.row,
        condensed && styles.condensed,
        color && styles.colored,
        !repository.available && styles.unavailable,
        isSelected && styles.selected,
        isDragging && styles.dragging,
      )}
      style={color ? { '--group-color': color } : undefined}
      draggable={canDrag}
      onDragStart={canDrag ? handleDragStart : undefined}
      onDragEnd={canDrag ? () => setDrag(null) : undefined}
    >
      {isStub ? (
        <StubBody repository={repository} condensed={condensed} />
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
          <Identity repository={repository} condensed={condensed} />
          {repository.available ? (
            <RowStatus summary={repository.summary} condensed={condensed} />
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
          size={condensed ? 'small' : 'middle'}
          icon={<MoreOutlined />}
          aria-label={`Options for ${repository.name}`}
        />
      </Dropdown>
      {naming && (
        <GroupNameDialog
          title="New group"
          okText="Create and add"
          onSave={addToNewGroup}
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
