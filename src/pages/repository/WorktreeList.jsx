import {
  CheckCircleFilled,
  FolderOutlined,
  LockOutlined,
  MoreOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Tag } from 'antd';
import clsx from 'clsx';
import { CommitHelper } from './CommitHelper.js';
import { useWorktreeActions } from './useWorktreeActions.jsx';
import styles from './WorktreeList.module.css';

function WorktreeIcon({ worktree }) {
  if (worktree.isCurrent) return <CheckCircleFilled className={styles.iconCurrent} />;
  if (worktree.prunable) return <WarningOutlined className={styles.iconWarning} />;
  return <FolderOutlined className={styles.icon} />;
}

function describe(worktree) {
  if (worktree.branch) return worktree.branch;
  return `detached at ${CommitHelper.shortHash(worktree.head)}`;
}

function WorktreeRow({ worktree, actions }) {
  const items = actions.menuItems(worktree);
  const canOpen = !worktree.isCurrent && !worktree.prunable;

  return (
    <Dropdown menu={{ items }} trigger={['contextMenu']}>
      <li className={clsx(styles.row, worktree.isCurrent && styles.current)}>
        <button
          type="button"
          className={styles.button}
          title={[
            worktree.path,
            worktree.lockReason && `Locked: ${worktree.lockReason}`,
            worktree.prunable && 'Its folder is gone. Prune to clear it away.',
            canOpen && 'Click to open it in a tab',
          ]
            .filter(Boolean)
            .join('\n')}
          disabled={!canOpen}
          onClick={() => actions.open(worktree.path)}
        >
          <WorktreeIcon worktree={worktree} />
          <span className={styles.text}>
            <span className={styles.name}>{worktree.name}</span>
            <span className={styles.meta}>{describe(worktree)}</span>
          </span>
          {worktree.isMain && <Tag className={styles.tag}>main</Tag>}
          {worktree.locked && <LockOutlined className={styles.icon} aria-label="Locked" />}
          {worktree.prunable && (
            <Tag color="warning" className={styles.tag}>
              missing
            </Tag>
          )}
        </button>
        <Dropdown menu={{ items }} trigger={['click']}>
          <Button
            className={styles.menu}
            type="text"
            size="small"
            icon={<MoreOutlined />}
            aria-label={`Actions for worktree ${worktree.name}`}
          />
        </Dropdown>
      </li>
    </Dropdown>
  );
}

/** The repository's working trees: where else its branches are checked out. */
export function WorktreeList({ worktrees }) {
  const actions = useWorktreeActions();
  const missing = worktrees.filter((worktree) => worktree.prunable).length;

  return (
    <>
      <ul className={styles.list}>
        {worktrees.map((worktree) => (
          <WorktreeRow key={worktree.path} worktree={worktree} actions={actions} />
        ))}
      </ul>
      {worktrees.length === 1 && (
        <p className={styles.hint}>
          Work on another branch in its own folder, without switching here.
        </p>
      )}
      <div className={styles.footer}>
        <Button size="small" type="text" onClick={() => actions.createWorktree()}>
          New worktree…
        </Button>
        {missing > 0 && (
          <Button size="small" type="text" disabled={actions.blocked} onClick={actions.prune}>
            Prune {missing} missing
          </Button>
        )}
      </div>
    </>
  );
}
