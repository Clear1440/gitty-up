import { DeleteOutlined, EditOutlined, MoreOutlined, RightOutlined } from '@ant-design/icons';
import { App, Button, Dropdown } from 'antd';
import clsx from 'clsx';
import { useState } from 'react';
import { monoRepositoryId } from '../../paths.js';
import { useDeleteGroup, useRenameGroup } from '../../queries/repositories.js';
import { useTabs } from '../../tabs/TabsContext.jsx';
import { GroupNameDialog } from './GroupNameDialog.jsx';
import { OpenMonoButton } from './OpenMonoButton.jsx';
import { RepositoryRow } from './RepositoryRow.jsx';
import styles from './RepositorySection.module.css';

function GroupMenu({ group }) {
  const { modal, notification } = App.useApp();
  const [renaming, setRenaming] = useState(false);
  const rename = useRenameGroup();
  const remove = useDeleteGroup();
  const { closeTab } = useTabs();

  const confirmDelete = () => {
    modal.confirm({
      title: `Delete the ${group.name} group?`,
      content: 'Its repositories stay linked and move to Ungrouped.',
      okText: 'Delete group',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await remove.mutateAsync(group.id);
          closeTab(monoRepositoryId(group.id));
        } catch (error) {
          notification.error({ title: 'Could not delete the group', description: error.message });
        }
      },
    });
  };

  const items = [
    { key: 'rename', label: 'Rename', icon: <EditOutlined />, onClick: () => setRenaming(true) },
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

/** A collapsible group of repositories on the home page. */
export function RepositorySection({ section, groups, collapsed, onToggle }) {
  const { group, name, repositories } = section;

  return (
    <section>
      <header className={styles.header}>
        <h2 className={styles.heading}>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            <RightOutlined className={clsx(styles.caret, !collapsed && styles.caretOpen)} />
            <span className={styles.name}>{name}</span>
            <span className={styles.count}>{repositories.length}</span>
          </button>
        </h2>
        {group && <OpenMonoButton group={group} />}
        {group && <GroupMenu group={group} />}
      </header>
      {!collapsed &&
        (repositories.length > 0 ? (
          <div className={styles.list}>
            {repositories.map((repository) => (
              <RepositoryRow key={repository.id} repository={repository} groups={groups} />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            Empty. Use the options menu on a repository to move it here.
          </p>
        ))}
    </section>
  );
}
