import { App } from 'antd';
import { useRepositoryContext } from '../RepositoryContext.js';
import { groupRefs } from './groupRefs.js';

/**
 * What can be done with a commit in the history: its menu `items`, and `checkout` for a
 * double click. A commit that one local branch ends on checks out that branch, as that
 * is nearly always what was meant, rather than leaving HEAD on no branch.
 */
export function useCommitMenu(commit) {
  const { repository, status, run, openDialog, isBusy } = useRepositoryContext();
  const { modal } = App.useApp();

  // Each of a mono repo's commits belongs to one member, so these act on that repository.
  if (repository.isMono) return { items: null, checkout: () => {} };

  const blocked = isBusy || Boolean(status.operation);
  const isHead = commit.refs.some((ref) => ref.type === 'head');
  const isMerge = commit.parents.length > 1;
  const current = status.branch ?? 'HEAD';
  const localBranches = groupRefs(commit.refs).filter((group) => group.local);
  const branch = localBranches.length === 1 ? localBranches[0].name : null;
  const { hash, shortHash, subject } = commit;

  const checkout = () => {
    if (isHead || blocked) return;
    if (branch) run('checkout', { branch });
    else run('checkoutCommit', { hash, shortHash });
  };

  const confirmHardReset = () =>
    modal.confirm({
      title: `Reset ${current} to ${shortHash}?`,
      content:
        'Discards every commit after it and all uncommitted changes. Files git has never tracked stay.',
      okText: 'Reset',
      okButtonProps: { danger: true },
      focusable: { autoFocusButton: 'cancel' },
      onOk: () => run('resetToCommit', { hash, shortHash, mode: 'hard' }),
    });

  const items = [
    {
      key: 'checkout',
      label: branch ? `Check out ${branch}` : 'Check out this commit',
      disabled: isHead || blocked,
      onClick: checkout,
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
      key: 'new-branch',
      label: 'New branch from here…',
      onClick: () => openDialog('createBranch', { commit: { hash, shortHash, subject } }),
    },
  ];

  return { items, checkout };
}
