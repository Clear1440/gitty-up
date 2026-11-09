import { App } from 'antd';
import { useRepositoryContext } from './RepositoryContext.js';
import { StatusHelper } from './StatusHelper.js';
import { usePatchActions } from './usePatchActions.js';

/**
 * What can be done with a stash, as menu items. The sidebar, the history tree and
 * the stash's own pane all offer the same menu. `extraItems` go first, such as "Preview".
 */
export function useStashMenu(stash, { extraItems = [] } = {}) {
  const { status, run, isBusy } = useRepositoryContext();
  const { savePatch } = usePatchActions();
  const { modal } = App.useApp();
  const blocked = StatusHelper.isBlocked(status, isBusy);

  const confirmDelete = () => {
    modal.confirm({
      title: 'Delete this stash?',
      content: `"${stash.message}" will be deleted. This cannot be undone.`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      focusable: { autoFocusButton: 'cancel' },
      onOk: () => run('stashDrop', { ref: stash.ref }),
    });
  };

  return [
    ...extraItems,
    {
      key: 'apply',
      label: 'Apply and keep stash',
      disabled: blocked,
      onClick: () => run('stashApply', { ref: stash.ref }),
    },
    {
      key: 'pop',
      label: 'Pop (apply and remove)',
      disabled: blocked,
      onClick: () => run('stashPop', { ref: stash.ref }),
    },
    {
      key: 'patch',
      label: 'Save as patch…',
      onClick: () => savePatch({ source: 'stash', ref: stash.ref }),
    },
    { type: 'divider' },
    { key: 'delete', label: 'Delete…', danger: true, disabled: isBusy, onClick: confirmDelete },
  ];
}
