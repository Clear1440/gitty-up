import {
  BranchesOutlined,
  CheckOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DownOutlined,
  ExportOutlined,
  InboxOutlined,
  MergeOutlined,
  PlusOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Divider, Dropdown, Space, Tooltip } from 'antd';
import { useNavigate } from 'react-router';
import { AheadBehind } from '../../components/AheadBehind.jsx';
import { paths } from '../../paths.js';
import { useStashes } from '../../queries/git.js';
import { queryKeys } from '../../queries/queryKeys.js';
import { countChangedFiles } from './countChangedFiles.js';
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();

  const changedFileCount = countChangedFiles(status);
  const midOperation = Boolean(status.operation);

  // The time makes every press a new request, even with the commit box already open.
  const openCommitMessage = () => {
    navigate(paths.uncommitted(repository.id), { state: { focusCommitMessage: Date.now() } });
  };

  const fetchAndPrune = async () => {
    if (!(await run('fetch'))) return;

    // run() waits for the refetch, so this is what the fetch left.
    const { local } = queryClient.getQueryData(queryKeys.branches(repository.id));
    const names = local
      .filter(({ upstreamGone, isCurrent }) => upstreamGone && !isCurrent)
      .map(({ name }) => name);

    if (names.length > 0) openDialog('pruneBranches', { names });
    else message.info('No local branches to prune');
  };

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

  const fetchMenu = [{ key: 'prune', label: 'Fetch & Prune', onClick: fetchAndPrune }];

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


  return (
    <nav className={styles.actionBar} aria-label="Git actions">
      <SplitActionButton
        label="Fetch"
        hint="Download updates from all remotes"
        icon={<SyncOutlined />}
        loading={pendingAction === 'fetch'}
        disabled={isBusy}
        menuItems={fetchMenu}
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
        label="Commit"
        hint="Jump to the commit message"
        icon={<CheckOutlined />}
        count={status.staged.length}
        onClick={openCommitMessage}
      />
      <ActionButton
        label="Branch"
        hint="Create a new branch"
        icon={<PlusOutlined />}
        disabled={isBusy}
        onClick={() => openDialog('createBranch')}
      />
      <ActionButton
        label="Merge"
        hint="Merge or rebase with another branch"
        icon={<MergeOutlined />}
        disabled={isBusy || midOperation}
        onClick={() => openDialog('merge')}
      />
      <ActionButton
        label="Stash"
        hint="Set your changes aside"
        icon={<InboxOutlined />}
        count={changedFileCount}
        loading={pendingAction === 'stash'}
        disabled={isBusy || midOperation || changedFileCount === 0}
        onClick={() => openDialog('stash')}
      />
      <ActionButton
        label="Pop"
        hint="Restore the latest stash and remove it"
        icon={<ExportOutlined />}
        count={stashes.length}
        loading={pendingAction === 'stashPop'}
        disabled={isBusy || midOperation || stashes.length === 0}
        onClick={() => run('stashPop')}
      />

      {/* Last, so its changing width can never move a button under the cursor. */}
      <CurrentBranch status={status} />
    </nav>
  );
}
