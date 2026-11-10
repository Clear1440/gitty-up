import { App, Checkbox } from 'antd';
import { useNavigate } from 'react-router';
import { paths } from '../../paths.js';
import { useLinkRepository, useRepositories, useUnlinkRepository } from '../../queries/repositories.js';
import { useTabs } from '../../tabs/TabsContext.jsx';
import { useRepositoryContext } from './RepositoryContext.js';
import { StatusHelper } from './StatusHelper.js';
import { samePath } from './worktrees.js';

/**
 * Opening, removing and the menu of a repository's working trees. Opening one links its
 * folder like any other repository, so it gets a tab of its own.
 */
export function useWorktreeActions() {
  const { status, run, openDialog, isBusy } = useRepositoryContext();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { openTab, closeTab } = useTabs();
  const link = useLinkRepository();
  const unlink = useUnlinkRepository();
  const { data: repositories = [] } = useRepositories();
  const blocked = StatusHelper.isBlocked(status, isBusy);

  const open = async (folder) => {
    try {
      const repository = await link.mutateAsync(folder);
      openTab(repository.id, paths.repository(repository.id));
      navigate(paths.repository(repository.id));
    } catch (error) {
      message.error(error.message);
    }
  };

  /** A removed working tree's folder is gone, so its tab and listing would only fail. */
  const forget = async (folder) => {
    const linked = repositories.find((repository) => samePath(repository.path, folder));
    if (!linked) return;
    closeTab(linked.id);
    await unlink.mutateAsync(linked.id).catch(() => {});
  };

  const remove = (worktree) => {
    let force = false;
    modal.confirm({
      title: `Remove the worktree ${worktree.name}?`,
      content: (
        <RemoveWorktreeContent worktree={worktree} onForceChange={(value) => (force = value)} />
      ),
      okText: 'Remove',
      okButtonProps: { danger: true },
      focusable: { autoFocusButton: 'cancel' },
      onOk: async () => {
        const removed = await run('removeWorktree', {
          path: worktree.path,
          force,
          name: worktree.name,
        });
        if (removed) await forget(worktree.path);
      },
    });
  };

  const copyPath = async (folder) => {
    try {
      await navigator.clipboard.writeText(folder);
      message.success('Copied the path');
    } catch {
      message.error('Could not reach the clipboard');
    }
  };

  const menuItems = (worktree) => [
    {
      key: 'open',
      label: worktree.isCurrent ? 'Open (this tab)' : 'Open in a tab',
      disabled: worktree.isCurrent || worktree.prunable,
      onClick: () => open(worktree.path),
    },
    { key: 'copy', label: 'Copy path', onClick: () => copyPath(worktree.path) },
    ...(worktree.isMain
      ? []
      : [
          worktree.locked
            ? {
                key: 'unlock',
                label: 'Unlock',
                disabled: isBusy,
                onClick: () => run('unlockWorktree', { path: worktree.path }),
              }
            : {
                key: 'lock',
                label: 'Lock',
                title: 'Keeps git from clearing it away while its folder is out of reach',
                disabled: isBusy,
                onClick: () => run('lockWorktree', { path: worktree.path }),
              },
          { type: 'divider' },
          {
            key: 'remove',
            label: 'Remove…',
            danger: true,
            title: worktree.isCurrent ? 'Open another worktree to remove this one' : undefined,
            disabled: isBusy || worktree.isCurrent,
            onClick: () => remove(worktree),
          },
        ]),
  ];

  return {
    open,
    menuItems,
    createWorktree: (props) => openDialog('createWorktree', props),
    prune: () => run('pruneWorktrees'),
    blocked,
  };
}

function RemoveWorktreeContent({ worktree, onForceChange }) {
  return (
    <>
      <p>
        Deletes {worktree.path}
        {worktree.branch ? `. The ${worktree.branch} branch and its commits stay.` : '.'}
      </p>
      <Checkbox onChange={(event) => onForceChange(event.target.checked)}>
        Remove even if it has uncommitted changes{worktree.locked ? ' or is locked' : ''}
      </Checkbox>
    </>
  );
}
