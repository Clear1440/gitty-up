import { useConfirmDanger } from '../../../components/useConfirmDanger.js';
import { PathHelper } from '../../../utils/PathHelper.js';
import { TextHelper } from '../../../utils/TextHelper.js';
import { useCopyToClipboard } from '../../../utils/useCopyToClipboard.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { StatusHelper } from '../StatusHelper.js';

/** The one value every item shares, or null if they differ or any has none. */
function shared(values) {
  const [first] = values;
  return first && values.every((value) => value === first) ? first : null;
}

/**
 * Right-click menus for changed files. `files` are the files it acts on: the one
 * clicked, or every file picked with shift or ctrl when the click was on one of those.
 */
export function useFileMenu() {
  const { repository, status, run, openDialog, isBusy } = useRepositoryContext();
  const confirmDanger = useConfirmDanger();
  const copy = useCopyToClipboard();
  const blocked = StatusHelper.isBlocked(status, isBusy);

  const describe = (files) =>
    files.length === 1 ? files[0].path : TextHelper.countOf(files.length, 'file');

  const copyItems = (files) => {
    const paths = files.map((file) => file.path);
    const plural = files.length > 1;
    return [
      {
        key: 'copy-path',
        label: plural ? 'Copy paths' : 'Copy path',
        onClick: () => copy(paths.join('\n'), plural ? 'paths' : paths[0]),
      },
      // A mono repo's files are spread over several folders, with no one to start from.
      ...(repository.path
        ? [
            {
              key: 'copy-full-path',
              label: plural ? 'Copy full paths' : 'Copy full path',
              onClick: () =>
                copy(
                  paths.map((filePath) => PathHelper.join(repository.path, filePath)).join('\n'),
                  plural ? 'full paths' : 'full path',
                ),
            },
          ]
        : []),
    ];
  };

  const confirmDiscard = (files) =>
    confirmDanger({
      title: `Discard changes to ${describe(files)}?`,
      content:
        files.length === 1
          ? `${files[0].path} goes back to its last commit. This cannot be undone.`
          : 'These files go back to their last commit, and new ones are deleted. This cannot be undone.',
      okText: 'Discard',
      onOk: () => run('discard', { paths: files.map((file) => file.path) }),
    });

  const ignoreItem = (files) => {
    const paths = files.map((file) => file.path);
    const tracked = files.some((file) => file.status !== 'untracked');
    const extension = shared(paths.map(PathHelper.extensionOf));
    const folder = shared(paths.map(PathHelper.folderOf));
    const ignore = (kind) => run('ignore', { paths, kind });
    return {
      key: 'ignore',
      label: 'Ignore',
      // Git keeps tracking a file it already has, whatever .gitignore says.
      disabled: blocked || tracked,
      title: tracked ? 'Only new files can be ignored. Git keeps tracking the rest.' : undefined,
      children: [
        {
          key: 'ignore-file',
          label: files.length === 1 ? `Ignore ${paths[0]}` : `Ignore these ${paths.length} files`,
          onClick: () => ignore('file'),
        },
        ...(extension
          ? [{ key: 'ignore-extension', label: `Ignore all *${extension} files`, onClick: () => ignore('extension') }]
          : []),
        ...(folder
          ? [{ key: 'ignore-folder', label: `Ignore the ${folder}/ folder`, onClick: () => ignore('folder') }]
          : []),
      ],
    };
  };

  const unstagedItems = (files) => {
    const paths = files.map((file) => file.path);
    return [
      {
        key: 'stage',
        label: files.length === 1 ? 'Stage file' : `Stage ${paths.length} files`,
        disabled: isBusy,
        onClick: () => run('stage', { paths }),
      },
      {
        key: 'discard',
        label: 'Discard changes…',
        danger: true,
        disabled: isBusy,
        onClick: () => confirmDiscard(files),
      },
      ignoreItem(files),
      // Stashes are kept to each repository on its own, so a mono repo has none.
      ...(repository.isMono
        ? []
        : [
            {
              key: 'stash',
              label: files.length === 1 ? 'Stash file…' : `Stash ${paths.length} files…`,
              disabled: blocked,
              onClick: () => openDialog('stash', { paths }),
            },
          ]),
      { type: 'divider' },
      ...copyItems(files),
    ];
  };

  const stagedItems = (files) => [
    {
      key: 'unstage',
      label: files.length === 1 ? 'Unstage file' : `Unstage ${files.length} files`,
      disabled: isBusy,
      onClick: () => run('unstage', { paths: files.map((file) => file.path) }),
    },
    { type: 'divider' },
    ...copyItems(files),
  ];

  return { unstagedItems, stagedItems, copyItems };
}
