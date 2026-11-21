import { useNavigate } from 'react-router';
import { paths } from '../../paths.js';
import { useRemotes, useTags } from '../../queries/git.js';
import { useCopyToClipboard } from '../../utils/useCopyToClipboard.js';
import { useRepositoryContext } from './RepositoryContext.js';
import { StatusHelper } from './StatusHelper.js';
import { TagHelper } from './TagHelper.js';

/**
 * Shows a tag's commit in the history, scrolled to and opened. The time makes every call
 * a new request, so a tag scrolled away from can be found again.
 */
export function useShowTag() {
  const navigate = useNavigate();
  const { repository } = useRepositoryContext();
  return ({ name, hash }) =>
    navigate(paths.focusTag(repository.id, { name, hash }), { state: { focusBranch: Date.now() } });
}

/**
 * What can be done with a tag, as menu items, wherever it is shown. The sidebar and the
 * labels in the history offer the same menu. `name` is the tag's name, and `show` also
 * gives a "Show in history" item.
 */
export function useTagMenu(name, { show = false } = {}) {
  const showTag = useShowTag();
  const { repository, status, run, openDialog, isBusy } = useRepositoryContext();
  const { data: tags } = useTags(repository.id);
  const { data: remoteOptions } = useRemotes(repository.id);
  const copy = useCopyToClipboard();
  const blocked = StatusHelper.isBlocked(status, isBusy);

  const tag = TagHelper.find(tags, name);
  const remote = remoteOptions?.defaultRemote ?? null;

  return [
    ...(show && tag
      ? [
          {
            key: 'show',
            label: 'Show in history',
            onClick: () => showTag(tag),
          },
        ]
      : []),
    {
      key: 'checkout',
      label: 'Check out (detached)',
      title: tag ? `Checks out ${tag.commit}, on no branch` : undefined,
      disabled: !tag || blocked,
      onClick: () => run('checkoutCommit', { hash: tag.hash, shortHash: tag.commit }),
    },
    {
      key: 'push',
      label: remote ? `Push to ${remote}` : 'Push',
      title: remote ? undefined : 'This repository has no remote to push to',
      disabled: !remote || isBusy,
      onClick: () => run('pushTag', { name, remote }),
    },
    { key: 'copy-name', label: 'Copy tag name', onClick: () => copy(name) },
    { type: 'divider' },
    {
      key: 'delete',
      label: 'Delete…',
      danger: true,
      disabled: isBusy,
      onClick: () => openDialog('deleteTag', { name }),
    },
  ];
}
