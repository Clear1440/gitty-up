import { useNavigate } from 'react-router';
import { paths } from '../../paths.js';
import { useRemotes, useTags } from '../../queries/git.js';
import { useCopyToClipboard } from '../../utils/useCopyToClipboard.js';
import { useRepositoryContext } from './RepositoryContext.js';
import { StatusHelper } from './StatusHelper.js';
import { TagHelper } from './TagHelper.js';

/**
 * What can be done with a tag, as menu items, wherever it is shown. The sidebar and the
 * labels in the history offer the same menu. `name` is the tag's name, and `show` also
 * gives a "Show in history" item.
 */
export function useTagMenu(name, { show = false } = {}) {
  const navigate = useNavigate();
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
            // The time makes every click a new request, so a tag scrolled away from can be found again.
            onClick: () =>
              navigate(paths.focusTag(repository.id, { name, hash: tag.hash }), {
                state: { focusBranch: Date.now() },
              }),
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
