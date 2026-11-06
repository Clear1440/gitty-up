import {
  BranchesOutlined,
  CheckOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DownOutlined,
  InboxOutlined,
  MergeOutlined,
  PlusOutlined,
  SwapOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { App, Button, Divider, Dropdown, Space, Tooltip } from 'antd';
import { AheadBehind } from '../../components/AheadBehind.jsx';
import { useStashes } from '../../queries/git.js';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './ActionBar.module.css';

function ActionButton({ label, hint, count = 0, ...buttonProps }) {
  return (
    <Tooltip title={hint ?? label}>
      <Button aria-label={label} {...buttonProps}>
        <span className={styles.actionLabel}>{label}</span>
        {count > 0 && <span className={styles.actionCount}>{count}</span>}
      </Button>
    </Tooltip>
  );
}

function SplitActionButton({ menuItems, menuDisabled, ...actionProps }) {
  const isMenuDisabled = menuDisabled ?? actionProps.disabled;
  return (
    <Space.Compact>
      <ActionButton {...actionProps} />
      <Dropdown menu={{ items: menuItems }} trigger={['click']} disabled={isMenuDisabled}>
        <Button
          disabled={isMenuDisabled}
          aria-label={`More ${actionProps.label} options`}
          icon={<DownOutlined className={styles.splitCaret} />}
        />
      </Dropdown>
    </Space.Compact>
  );
}

function CurrentBranch({ status }) {
  const title = status.upstream ? `Tracking ${status.upstream}` : 'No upstream branch';
  return (
    <Tooltip title={title}>
      <div className={styles.currentBranch}>
        <BranchesOutlined />
        <span className={styles.currentBranchName}>
          {status.branch ?? `detached at ${status.headHash?.slice(0, 7)}`}
        </span>
        <AheadBehind ahead={status.ahead} behind={status.behind} />
      </div>
    </Tooltip>
  );
}

export function ActionBar() {
  const { repository, status, run, openDialog, isBusy, pendingAction } = useRepositoryContext();
  const { data: stashes = [] } = useStashes(repository.id);
  const { modal } = App.useApp();

  const hasChanges =
    status.staged.length + status.unstaged.length + status.conflicted.length > 0;
  const midOperation = Boolean(status.operation);

  const confirmForcePush = () => {
    modal.confirm({
      title: `Force push ${status.branch}?`,
      content:
        'This replaces the branch on the remote with yours. It stops if someone else has pushed since your last fetch.',
      okText: 'Force push',
      okButtonProps: { danger: true },
      onOk: () => run('push', { force: true }),
    });
  };

  const pullMenu = [
    { key: 'rebase', label: 'Pull with rebase', onClick: () => run('pull', { mode: 'rebase' }) },
    {
      key: 'ff-only',
      label: 'Pull fast-forward only',
      onClick: () => run('pull', { mode: 'ff-only' }),
    },
  ];

  const pushMenu = [
    { key: 'force', label: 'Force push…', danger: true, onClick: confirmForcePush },
  ];

  const stashMenu = [
    {
      key: 'message',
      label: 'Stash with message…',
      disabled: !hasChanges,
      onClick: () => openDialog('stash'),
    },
    {
      key: 'pop',
      label: stashes.length > 0 ? `Pop latest (${stashes.length} stashed)` : 'Pop latest',
      disabled: stashes.length === 0,
      onClick: () => run('stashPop'),
    },
  ];

  return (
    <nav className={styles.actionBar} aria-label="Git actions">
      <ActionButton
        label="Fetch"
        hint="Download updates from all remotes"
        icon={<SyncOutlined />}
        loading={pendingAction === 'fetch'}
        disabled={isBusy}
        onClick={() => run('fetch')}
      />
      <SplitActionButton
        label="Pull"
        hint="Fetch and merge from the upstream branch"
        icon={<CloudDownloadOutlined />}
        count={status.behind}
        loading={pendingAction === 'pull'}
        disabled={isBusy || midOperation}
        menuItems={pullMenu}
        onClick={() => run('pull', { mode: 'merge' })}
      />
      <SplitActionButton
        label="Push"
        hint={status.upstream ? `Push to ${status.upstream}` : 'Publish this branch'}
        icon={<CloudUploadOutlined />}
        count={status.ahead}
        loading={pendingAction === 'push'}
        disabled={isBusy || midOperation || !status.branch}
        menuItems={pushMenu}
        onClick={() => run('push')}
      />
      <Divider orientation="vertical" />

      <ActionButton
        type="primary"
        label="Commit"
        icon={<CheckOutlined />}
        count={status.staged.length}
        disabled={isBusy}
        onClick={() => openDialog('commit')}
      />
      <ActionButton
        label="Branch"
        hint="Create a new branch"
        icon={<PlusOutlined />}
        disabled={isBusy}
        onClick={() => openDialog('createBranch')}
      />
      <ActionButton
        label="Checkout"
        hint="Switch to another branch"
        icon={<SwapOutlined />}
        disabled={isBusy || midOperation}
        onClick={() => openDialog('checkout')}
      />
      <ActionButton
        label="Merge"
        hint="Merge or rebase with another branch"
        icon={<MergeOutlined />}
        disabled={isBusy || midOperation}
        onClick={() => openDialog('merge')}
      />
      <SplitActionButton
        label="Stash"
        hint="Set your changes aside"
        icon={<InboxOutlined />}
        count={stashes.length}
        loading={pendingAction === 'stash'}
        disabled={isBusy || midOperation || !hasChanges}
        menuDisabled={isBusy || midOperation}
        menuItems={stashMenu}
        onClick={() => run('stash')}
      />

      {/* Last, so its changing width can never move a button under the cursor. */}
      <CurrentBranch status={status} />
    </nav>
  );
}
