import {
  BranchesOutlined,
  CheckOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DownOutlined,
  ExportOutlined,
  FieldTimeOutlined,
  FileTextOutlined,
  InboxOutlined,
  MergeOutlined,
  PlusOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Divider, Dropdown, Space } from 'antd';
import clsx from 'clsx';
import { useMatch, useNavigate } from 'react-router';
import { AheadBehind } from '../../components/AheadBehind.jsx';
import { Tooltip } from '../../components/Tooltip.jsx';
import { useConfirmDanger } from '../../components/useConfirmDanger.js';
import { paths } from '../../paths.js';
import { useStashes } from '../../queries/git.js';
import { queryKeys } from '../../queries/queryKeys.js';
import { useIsFetchingAllRepositories } from '../../queries/repositories.js';
import { useIsAutoFetching } from '../../queries/useAutoFetch.js';
import { TextHelper } from '../../utils/TextHelper.js';
import { CommitHelper } from './CommitHelper.js';
import { AlongsideBranches, MonoMembers } from './MonoMembers.jsx';
import { useRepositoryContext } from './RepositoryContext.js';
import { ScriptsMenu } from './ScriptsMenu.jsx';
import { StatusHelper } from './StatusHelper.js';
import { usePatchActions } from './usePatchActions.js';
import { usePush } from './usePush.js';
import { useUndoCommitShortcut } from './useUndoCommitShortcut.js';
import styles from './ActionBar.module.css';

function ActionButton({ label, hint, count = 0, ...buttonProps }) {
  return (
    <Tooltip title={hint ?? label}>
      <Button
        aria-label={label}
        {...buttonProps}
        className={clsx(buttonProps.className, count > 0 && styles.withCount)}
      >
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
    <div className={styles.currentBranch}>
      <Tooltip title={title}>
        <div className={styles.currentBranchDetails}>
          <BranchesOutlined />
          <span className={styles.currentBranchName}>
            {status.branch ?? `detached at ${CommitHelper.shortHash(status.headHash)}`}
          </span>
          <AheadBehind ahead={status.ahead} behind={status.behind} />
        </div>
      </Tooltip>
      {status.mono && <AlongsideBranches />}
      {status.mono && <MonoMembers />}
    </div>
  );
}

export function ActionBar() {
  const { repository, status, run, openDialog, isBusy, pendingAction } = useRepositoryContext();
  const { data: stashes = [] } = useStashes(repository.id);
  const navigate = useNavigate();
  const onReflog = Boolean(useMatch('/repositories/:repositoryId/reflog'));
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const confirmDanger = useConfirmDanger();
  const push = usePush();
  const { savePatch, pickPatchFile } = usePatchActions();
  useUndoCommitShortcut();
  // Fetches started on their own, on opening or coming back to the tab, or by fetching
  // every repository, spin the button too, so a click doesn't seem to do nothing.
  const isAutoFetching = useIsAutoFetching(repository.id);
  const isFetchingAll = useIsFetchingAllRepositories();
  const isFetching = pendingAction === 'fetch' || isAutoFetching || isFetchingAll;

  const changedFileCount = StatusHelper.countChangedFiles(status);
  const midOperation = Boolean(status.operation);
  const needsPublishing = StatusHelper.needsPublishing(status);

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
    // With nothing on the remote there is nothing to overwrite.
    if (needsPublishing) {
      push();
      return;
    }
    confirmDanger({
      title: `Force push ${status.branch}?`,
      content: repository.isMono
        ? 'In every repository here, this replaces the branch on the remote with yours. Each one stops if someone else has pushed since your last fetch.'
        : 'This replaces the branch on the remote with yours. It stops if someone else has pushed since your last fetch.',
      okText: 'Force push',
      onOk: () => run('push', { force: true }),
    });
  };

  // Each hint says what its count means, and why a greyed out button can't be used.
  const waitHint = midOperation ? `Finish or abort the ${status.operation} first` : null;

  const pullHint = () => {
    if (!status.upstream) return 'Fetch and merge from the upstream branch';
    return status.behind > 0
      ? `Pull ${TextHelper.countOf(status.behind, 'commit')} from ${status.upstream}`
      : `Fetch and merge from ${status.upstream}`;
  };

  const pushHint = () => {
    if (!status.branch) return 'Check out a branch to push';
    if (needsPublishing) return 'Publish this branch to a remote';
    if (StatusHelper.tracksOtherName(status)) {
      return `Push to ${status.upstream}, which is named differently from ${status.branch}`;
    }
    return status.ahead > 0
      ? `Push ${TextHelper.countOf(status.ahead, 'commit')} to ${status.upstream}`
      : `Nothing new to push to ${status.upstream}`;
  };

  const stagedCount = status.staged.length;
  const commitHint =
    stagedCount > 0
      ? `${TextHelper.countOf(stagedCount, 'file')} staged. Write the commit message`
      : 'Review your changes and write the commit message';

  const stashHint =
    changedFileCount > 0
      ? `Set the changes to ${TextHelper.countOf(changedFileCount, 'file')} aside, to bring back later`
      : 'No changes to set aside';

  const popHint =
    stashes.length > 0
      ? 'Bring back the latest stash and remove it from the list'
      : 'No stashes to bring back';

  const fetchMenu = [{ key: 'prune', label: 'Fetch & Prune', onClick: fetchAndPrune }];

  const pullMenu = [
    { key: 'rebase', label: 'Pull with rebase', onClick: () => run('pull', { mode: 'rebase' }) },
    {
      key: 'ff-only',
      label: 'Pull fast-forward only',
      onClick: () => run('pull', { mode: 'ff-only' }),
    },
  ];

  const patchMenu = [
    {
      key: 'save-uncommitted',
      label: 'Save uncommitted changes as patch…',
      onClick: () => savePatch({ source: 'uncommitted' }),
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
        loading={isFetching}
        disabled={isBusy}
        menuItems={fetchMenu}
        onClick={() => run('fetch')}
      />
      <SplitActionButton
        label="Pull"
        hint={waitHint ?? pullHint()}
        icon={<CloudDownloadOutlined />}
        count={status.behind}
        loading={pendingAction === 'pull'}
        disabled={isBusy || midOperation}
        menuItems={pullMenu}
        onClick={() => run('pull', { mode: 'merge' })}
      />
      <SplitActionButton
        label="Push"
        hint={waitHint ?? pushHint()}
        icon={<CloudUploadOutlined />}
        count={status.ahead}
        loading={pendingAction === 'push'}
        disabled={isBusy || midOperation || !status.branch}
        menuItems={pushMenu}
        onClick={() => push()}
      />
      <Divider orientation="vertical" />

      <ActionButton
        label="Commit"
        hint={commitHint}
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
        hint={
          waitHint ??
          (status.mono
            ? `Merge another branch into ${status.branch}, in ${TextHelper.joinWithAnd(status.mono.members.map(({ name }) => name))}`
            : 'Merge or rebase with another branch')
        }
        icon={<MergeOutlined />}
        disabled={isBusy || midOperation}
        onClick={() => openDialog('merge')}
      />
      {/* Across a mono repo these would quietly change several repositories at once. */}
      {!repository.isMono && (
        <>
          <ActionButton
            label="Stash"
            hint={waitHint ?? stashHint}
            icon={<InboxOutlined />}
            loading={pendingAction === 'stash'}
            disabled={isBusy || midOperation || changedFileCount === 0}
            onClick={() => openDialog('stash')}
          />
          <ActionButton
            label="Pop"
            hint={waitHint ?? popHint}
            icon={<ExportOutlined />}
            loading={pendingAction === 'stashPop'}
            disabled={isBusy || midOperation || stashes.length === 0}
            onClick={() => run('stashPop')}
          />
          <SplitActionButton
            label="Patch"
            hint={
              waitHint ?? 'Apply a .patch or .diff file. You can also drop one onto the window.'
            }
            icon={<FileTextOutlined />}
            loading={pendingAction === 'applyPatch'}
            disabled={isBusy || midOperation}
            menuDisabled={changedFileCount === 0}
            menuItems={patchMenu}
            onClick={pickPatchFile}
          />
          <ActionButton
            label="Reflog"
            hint={
              onReflog
                ? 'Back to the history'
                : 'Find commits lost to a reset, rebase, amend or deleted branch'
            }
            icon={<FieldTimeOutlined />}
            type={onReflog ? 'primary' : 'default'}
            onClick={() => navigate(onReflog ? paths.history(repository.id) : paths.reflog(repository.id))}
          />
        </>
      )}

      <div className={styles.trailing}>
        <ScriptsMenu />
        {/* Last, so its changing width can never move a button under the cursor. */}
        <CurrentBranch status={status} />
      </div>
    </nav>
  );
}
