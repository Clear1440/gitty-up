import { useConfirmDanger } from '../../../components/useConfirmDanger.js';
import { useCopyToClipboard } from '../../../utils/useCopyToClipboard.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { StatusHelper } from '../StatusHelper.js';
import { ReflogHelper } from './ReflogHelper.js';

/**
 * What can be done to recover a reflog entry's commit, as menu `items`. The same list
 * serves the row's menu and its buttons. Making a branch comes first, as it can't lose
 * anything. The rest mirror the history's commit menu, and wait for the same things.
 */
export function useReflogMenu(entry) {
  const { status, run, openDialog, isBusy } = useRepositoryContext();
  const confirmDanger = useConfirmDanger();
  const copy = useCopyToClipboard();

  const blocked = StatusHelper.isBlocked(status, isBusy);
  const isHead = entry.hash === status.headHash;
  const isMerge = (entry.parents?.length ?? 0) > 1;
  const current = StatusHelper.currentBranchName(status);
  const { hash, shortHash } = entry;
  const subject = ReflogHelper.describe(entry);

  const newBranch = () => openDialog('createBranch', { commit: { hash, shortHash, subject } });

  const confirmHardReset = () =>
    confirmDanger({
      title: `Reset ${current} to ${shortHash}?`,
      content:
        'Discards every commit after it and all uncommitted changes. Files git has never tracked stay.',
      okText: 'Reset',
      onOk: () => run('resetToCommit', { hash, shortHash, mode: 'hard' }),
    });

  const items = [
    {
      key: 'new-branch',
      label: 'New branch from here…',
      disabled: isBusy,
      onClick: newBranch,
    },
    {
      key: 'checkout',
      label: 'Check out (detached)',
      title: isHead ? 'Already checked out' : undefined,
      disabled: isHead || blocked,
      onClick: () => run('checkoutCommit', { hash, shortHash }),
    },
    {
      key: 'cherry-pick',
      label: `Cherry-pick onto ${current}`,
      title: isMerge ? 'Merge commits cannot be cherry-picked' : undefined,
      disabled: isHead || isMerge || blocked,
      onClick: () => run('cherryPick', { hash, subject }),
    },
    {
      key: 'reset',
      label: `Reset ${current} to here`,
      disabled: blocked,
      children: [
        {
          key: 'reset-soft',
          label: 'Soft: keep changes',
          disabled: isHead,
          onClick: () => run('resetToCommit', { hash, shortHash, mode: 'soft' }),
        },
        {
          key: 'reset-hard',
          label: 'Hard: discard changes…',
          danger: true,
          onClick: confirmHardReset,
        },
      ],
    },
    { type: 'divider' },
    {
      key: 'copy-hash',
      label: 'Copy hash',
      onClick: () => copy(hash, shortHash),
    },
  ];

  return { items, newBranch, canBranch: !isBusy };
}
