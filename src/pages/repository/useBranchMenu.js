import { useNavigate } from 'react-router';
import { paths } from '../../paths.js';
import { useRepositoryContext } from './RepositoryContext.js';
import { StatusHelper } from './StatusHelper.js';

/**
 * What can be done with a branch, wherever it is shown. `kind` is 'local' or 'remote',
 * and `branch` is one from useBranches. Gives the menu's `items`, and `checkout` too.
 */
export function useBranchMenu(branch, kind) {
  const navigate = useNavigate();
  const { repository, status, run, openDialog, isBusy } = useRepositoryContext();

  const isRemote = kind === 'remote';
  // Across a mono repo, merging or rebasing would rewrite several repositories at once.
  const canMerge = !repository.isMono;
  const blocked = StatusHelper.isBlocked(status, isBusy);
  const currentName = StatusHelper.currentBranchName(status);

  const checkout = () => {
    if (!branch.isCurrent && !blocked) run('checkout', { branch: branch.name, remote: isRemote });
  };

  const items = [
    {
      key: 'show-only',
      label: 'Show only this branch',
      onClick: () => navigate(paths.history(repository.id, branch.name)),
    },
    {
      key: 'checkout',
      label: 'Checkout',
      disabled: branch.isCurrent || blocked,
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
    { type: 'divider' },
    isRemote
      ? {
          key: 'delete-remote',
          label: branch.remote ? `Delete from ${branch.remote}…` : 'Delete from remote…',
          danger: true,
          disabled: blocked || !branch.remote,
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
