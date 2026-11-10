import {
  BgColorsOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderFilled,
  HolderOutlined,
  MoreOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { App, Button, Dropdown } from 'antd';
import clsx from 'clsx';
import { useRef, useState } from 'react';
import { useConfirmDanger } from '../../components/useConfirmDanger.js';
import {
  useDeleteGroup,
  useRenameGroup,
  useReorderGroups,
  useRepositories,
  useSetGroupColor,
  useSetRepositoryGroups,
} from '../../queries/repositories.js';
import { useTabs } from '../../tabs/TabsContext.jsx';
import { MonoIdHelper } from '../../utils/MonoIdHelper.js';
import { colorValueOf, GROUP_COLORS } from './groupColors.js';
import { groupIdsAfterDrop, reorderIds, UNGROUPED } from './groupMembership.js';
import { GroupNameDialog } from './GroupNameDialog.jsx';
import { OpenMonoButton } from './OpenMonoButton.jsx';
import { RepositoryRow } from './RepositoryRow.jsx';
import styles from './RepositorySection.module.css';
import { DRAG_TYPE, useRepositoryList } from './useRepositoryList.js';

/** Ctrl on Windows and Linux, Option on a Mac: what file managers use to copy on drop. */
const wantsCopy = (event) => event.ctrlKey || event.altKey;

/**
 * Lets repositories be dropped into a section, and groups be dropped before or after
 * it. Returns the props for the section element, and where a drop would land right
 * now: 'into', 'before', 'after' or null.
 */
function useSectionDrop(section, groups) {
  const { notification } = App.useApp();
  const { drag, setDrag } = useRepositoryList();
  const { data: repositories = [] } = useRepositories();
  const setGroups = useSetRepositoryGroups();
  const reorder = useReorderGroups();
  const [dropAt, setDropAt] = useState(null);

  const acceptsRepository =
    drag?.kind === 'repository' && drag.fromSectionId !== section.id;
  // Ungrouped always stays last, so groups only go around other groups.
  const acceptsGroup = drag?.kind === 'group' && section.group && drag.groupId !== section.id;

  const onDragOver = (event) => {
    if (acceptsRepository) {
      event.preventDefault();
      const copy = wantsCopy(event) && section.id !== UNGROUPED;
      event.dataTransfer.dropEffect = copy ? 'copy' : 'move';
      setDropAt('into');
    } else if (acceptsGroup) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = event.currentTarget.getBoundingClientRect();
      setDropAt(event.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
    }
  };

  const onDragLeave = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setDropAt(null);
  };

  const dropRepository = async (event) => {
    const repository = repositories.find(({ id }) => id === drag.repositoryId);
    if (!repository) return;
    const groupIds = groupIdsAfterDrop(repository, drag.fromSectionId, section.id, {
      copy: wantsCopy(event),
    });
    if (!groupIds) return;
    try {
      await setGroups.mutateAsync({ repositoryId: repository.id, groupIds });
    } catch (error) {
      notification.error({ title: 'Could not move the repository', description: error.message });
    }
  };

  const dropGroup = async () => {
    const ids = reorderIds(
      groups.map(({ id }) => id),
      drag.groupId,
      section.id,
      dropAt,
    );
    if (!ids) return;
    try {
      await reorder.mutateAsync(ids);
    } catch (error) {
      notification.error({ title: 'Could not reorder the groups', description: error.message });
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    if (acceptsRepository) dropRepository(event);
    else if (acceptsGroup) dropGroup();
    setDropAt(null);
    setDrag(null);
  };

  return {
    dropAt: acceptsRepository || acceptsGroup ? dropAt : null,
    dropProps: { onDragOver, onDragLeave, onDrop },
  };
}

/** The grip a group is dragged by, to put it somewhere else in the list. */
function GroupHandle({ group, sectionRef }) {
  const { setDrag } = useRepositoryList();

  const onDragStart = (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, group.id);
    const header = sectionRef.current.querySelector('header');
    const rect = header.getBoundingClientRect();
    event.dataTransfer.setDragImage(header, event.clientX - rect.left, event.clientY - rect.top);
    setDrag({ kind: 'group', groupId: group.id });
  };

  return (
    <span
      className={styles.handle}
      draggable
      role="button"
      aria-label={`Drag to reorder the ${group.name} group`}
      title="Drag to reorder"
      onDragStart={onDragStart}
      onDragEnd={() => setDrag(null)}
    >
      <HolderOutlined />
    </span>
  );
}

const Swatch = ({ value }) => (
  <span className={styles.swatch} style={value ? { background: value } : undefined} />
);

function GroupMenu({ group }) {
  const { notification } = App.useApp();
  const confirmDanger = useConfirmDanger();
  const [renaming, setRenaming] = useState(false);
  const rename = useRenameGroup();
  const remove = useDeleteGroup();
  const setColor = useSetGroupColor();
  const { closeTab } = useTabs();

  const saveColor = async (color) => {
    try {
      await setColor.mutateAsync({ groupId: group.id, color });
    } catch (error) {
      notification.error({ title: 'Could not change the color', description: error.message });
    }
  };

  const confirmDelete = () => {
    confirmDanger({
      title: `Delete the ${group.name} group?`,
      content: 'Its repositories stay linked, and in any other groups they are in.',
      okText: 'Delete group',
      onOk: async () => {
        try {
          await remove.mutateAsync(group.id);
          closeTab(MonoIdHelper.fromGroupId(group.id));
        } catch (error) {
          notification.error({ title: 'Could not delete the group', description: error.message });
        }
      },
    });
  };

  const colorItems = [
    ...GROUP_COLORS.map((color) => ({
      key: `color-${color.id}`,
      label: color.label,
      icon: <Swatch value={color.value} />,
      disabled: group.color === color.id,
      onClick: () => saveColor(color.id),
    })),
    { type: 'divider' },
    {
      key: 'no-color',
      label: 'No color',
      icon: <Swatch />,
      disabled: !colorValueOf(group.color),
      onClick: () => saveColor(null),
    },
  ];

  const items = [
    { key: 'rename', label: 'Rename', icon: <EditOutlined />, onClick: () => setRenaming(true) },
    { key: 'color', label: 'Color', icon: <BgColorsOutlined />, children: colorItems },
    { key: 'delete', label: 'Delete group', icon: <DeleteOutlined />, onClick: confirmDelete },
  ];

  return (
    <>
      <Dropdown menu={{ items }} trigger={['click']}>
        <Button
          type="text"
          size="small"
          icon={<MoreOutlined />}
          aria-label={`Options for the ${group.name} group`}
        />
      </Dropdown>
      {renaming && (
        <GroupNameDialog
          title="Rename group"
          okText="Rename"
          initialName={group.name}
          onSave={(name) => rename.mutateAsync({ groupId: group.id, name })}
          onClose={() => setRenaming(false)}
        />
      )}
    </>
  );
}

/**
 * A collapsible group of repositories on the home page. A group's color tints its
 * folder icon and marks the edge of every repository in it.
 */
export function RepositorySection({ section, groups, collapsed, onToggle }) {
  const { group, name, repositories } = section;
  const color = colorValueOf(group?.color);
  const { condensed } = useRepositoryList();
  const sectionRef = useRef(null);
  const { dropAt, dropProps } = useSectionDrop(section, groups);

  return (
    <section
      ref={sectionRef}
      className={clsx(
        styles.section,
        dropAt === 'into' && styles.dropInto,
        dropAt === 'before' && styles.dropBefore,
        dropAt === 'after' && styles.dropAfter,
      )}
      {...dropProps}
    >
      <header className={styles.header}>
        {group && <GroupHandle group={group} sectionRef={sectionRef} />}
        <h2 className={styles.heading}>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            <RightOutlined className={clsx(styles.caret, !collapsed && styles.caretOpen)} />
            {group && (
              <FolderFilled
                className={styles.folder}
                style={color ? { color } : undefined}
                aria-hidden
              />
            )}
            <span className={styles.name}>{name}</span>
            <span className={styles.count}>{repositories.length}</span>
          </button>
        </h2>
        {group && <OpenMonoButton group={group} />}
        {group && <GroupMenu group={group} />}
      </header>
      {!collapsed &&
        (repositories.length > 0 ? (
          <div className={clsx(styles.list, condensed && styles.condensedList)}>
            {repositories.map((repository) => (
              <RepositoryRow
                key={repository.id}
                repository={repository}
                groups={groups}
                sectionId={section.id}
                color={color}
              />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            {section.group
              ? 'Empty. Drag a repository here, or use its options menu.'
              : 'Drop a repository here to take it out of every group.'}
          </p>
        ))}
    </section>
  );
}
