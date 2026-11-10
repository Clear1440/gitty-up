import { App } from 'antd';
import { useNavigate } from 'react-router';
import { paths } from '../../paths.js';
import { BranchHelper } from '../../utils/BranchHelper.js';
import { useRepositoryContext } from './RepositoryContext.js';
import { StatusHelper } from './StatusHelper.js';
import { useWorktreeActions } from './useWorktreeActions.jsx';

/**
 * What can be done with a branch, wherever it is shown. `kind` is 'local' or 'remote',
 * and `branch` is one from useBranches. Gives the menu's `items`, and `checkout` too.
 */
export function useBranchMenu(branch, kind) {
  const navigate = useNavigate();
  const { repository, status, run, openDialog, isBusy } = useRepositoryContext();
  const { open: openWorktree, createWorktree } = useWorktreeActions();
  const { message } = App.useApp();

  const isRemote = kind === 'remote';
  const isProtected = isRemote && BranchHelper.isProtectedOnRemote(branch.localName);
  // Across a mono repo, merging or rebasing would rewrite several repositories at once.
  const canMerge = !repository.isMono;
  const blocked = StatusHelper.isBlocked(status, isBusy);
  const currentName = StatusHelper.currentBranchName(status);

  // Git checks a branch out in one working tree at a time, so one taken there opens there.
  const worktreePath = !isRemote && !branch.isCurrent ? branch.worktreePath : null;

  const checkout = () => {
    if (branch.isCurrent || blocked) return;
    if (worktreePath) openWorktree(worktreePath);
    else run('checkout', { branch: branch.name, remote: isRemote });
  };

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(branch.name);
      message.success(`Copied ${branch.name}`);
    } catch {
      message.error('Could not reach the clipboard');
    }
  };

  const worktreeItems = repository.isMono
    ? []
    : [
        worktreePath
          ? {
              key: 'open-worktree',
              label: 'Open its worktree',
              title: worktreePath,
              onClick: () => openWorktree(worktreePath),
            }
          : {
              key: 'worktree',
              label: 'Check out in a new worktree…',
              disabled: branch.isCurrent,
              onClick: () => createWorktree({ branch: branch.name }),
            },
        {
          key: 'worktree-new-branch',
          label: 'New branch in a new worktree…',
          onClick: () => createWorktree({ startPoint: branch.name }),
        },
      ];

  const items = [
    {
      key: 'show-only',
      label: 'Show only this branch',
      onClick: () => navigate(paths.history(repository.id, branch.name)),
    },
    {
      key: 'checkout',
      label: 'Checkout',
      title: worktreePath ? `Checked out in ${worktreePath}` : undefined,
      disabled: branch.isCurrent || blocked || Boolean(worktreePath),
      onClick: checkout,
    },
    ...(branch.isCurrent || !canMerge
      ? []
      : [
          {
            key: 'merge',
            label: `Merge ${branch.name} into ${currentName}`,
            disabled: blocked,
            onClick: () => openDialog('merge', { branch: branch.name }),
          },
        ]),
    // A remote branch can't be committed to, and a detached HEAD has no branch to merge.
    ...(branch.isCurrent || isRemote || !status.branch || !canMerge
      ? []
      : [
          {
            key: 'merge-into',
            label: `Merge ${status.branch} into ${branch.name}`,
            disabled: blocked,
            onClick: () => openDialog('mergeInto', { target: branch.name }),
          },
        ]),
    ...(canMerge
      ? [
          {
            key: 'rebase',
            label: `Rebase ${currentName} onto this`,
            disabled: branch.isCurrent || blocked,
            onClick: () => openDialog('merge', { branch: branch.name, mode: 'rebase' }),
          },
        ]
      : []),
    {
      key: 'new',
      label: 'New branch from here…',
      onClick: () => openDialog('createBranch', { startPoint: branch.name }),
    },
    ...worktreeItems,
    { type: 'divider' },
    { key: 'copy-name', label: 'Copy branch name', onClick: copyName },
    { type: 'divider' },
    isRemote
      ? {
          key: 'delete-remote',
          label: branch.remote ? `Delete from ${branch.remote}…` : 'Delete from remote…',
          danger: true,
          title: isProtected ? `${branch.localName} is protected on its remote` : undefined,
          disabled: blocked || !branch.remote || isProtected,
          onClick: () =>
            openDialog('deleteRemoteBranch', {
              name: branch.name,
              remote: branch.remote,
              localName: branch.localName,
            }),
        }
      : {
          key: 'delete',
          label: 'Delete…',
          danger: true,
          disabled: branch.isCurrent,
          onClick: () =>
            openDialog('deleteBranch', {
              name: branch.name,
              upstream: branch.upstreamGone ? null : branch.upstream,
            }),
        },
  ];

  return { items, checkout };
}
