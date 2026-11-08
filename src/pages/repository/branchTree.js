import { TimeHelper } from '../../utils/TimeHelper.js';

/** Compares names as people read them: case aside, and feature-10 after feature-9. */
const compareNames = (a, b) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

const commitTime = (branch) => TimeHelper.toTimestamp(branch.lastCommit.date);
const checkoutTime = (branch) => TimeHelper.toTimestamp(branch.lastCheckout);

/** The last time anything happened on a branch. The checked out one is in use right now. */
const activityTime = (branch) =>
  branch.isCurrent ? Infinity : Math.max(commitTime(branch), checkoutTime(branch));

export const DEFAULT_BRANCH_SORT = 'name-asc';

export const BRANCH_SORTS = [
  {
    value: 'committed',
    label: 'Recently committed',
    compare: (a, b) => commitTime(b) - commitTime(a),
  },
  {
    value: 'recent',
    label: 'Most recent',
    hint: 'Last committed to or checked out',
    compare: (a, b) => activityTime(b) - activityTime(a),
  },
  { value: 'name-asc', label: 'Alphabetical (asc)', compare: compareNames },
  { value: 'name-desc', label: 'Alphabetical (desc)', compare: (a, b) => compareNames(b, a) },
];

export function sortBranches(branches, sort) {
  const { compare } = BRANCH_SORTS.find(({ value }) => value === sort);
  return [...branches].sort(compare);
}

/** A remote's name can itself contain a slash, so it is one level however it is spelled. */
function pathOf(branch, showRemotes) {
  if (!branch.remote) return branch.name.split('/');
  const path = branch.localName.split('/');
  return showRemotes ? [branch.remote, ...path] : path;
}

/** A folder holding one item adds a level for nothing, so that item takes its place. */
function foldSingleItemFolders(nodes) {
  return nodes.map((node) => {
    if (node.type === 'branch') return node;

    const children = foldSingleItemFolders(node.children);
    if (children.length > 1) return { ...node, children };

    const [only] = children;
    return only.type === 'branch'
      ? { ...only, label: `${node.name}/${only.label}` }
      : { ...only, name: `${node.name}/${only.name}` };
  });
}

/**
 * Turns branch names into a directory tree: features/x and features/y share a
 * "features" folder, while a lone features/z stays one row. Nodes keep the order of
 * `branches`, and a folder sits where its first branch would, so a tree sorted by date
 * still reads newest first.
 *
 * `showRemotes` files remote branches under a folder per remote, which only helps when
 * there is more than one to tell apart.
 *
 * A folder is `{ type: 'folder', name, path, isRemote, branches, children }`, where
 * `branches` is everything inside it at any depth, and a branch is
 * `{ type: 'branch', label, branch }`.
 */
export function buildBranchTree(branches, { showRemotes = false } = {}) {
  const root = { path: '', children: [] };

  for (const branch of branches) {
    const segments = pathOf(branch, showRemotes);
    const label = segments.pop();

    let parent = root;
    for (const name of segments) {
      let folder = parent.children.find((node) => node.type === 'folder' && node.name === name);
      if (!folder) {
        const path = `${parent.path}${name}/`;
        const isRemote = showRemotes && parent === root && Boolean(branch.remote);
        folder = { type: 'folder', name, path, isRemote, branches: [], children: [] };
        parent.children.push(folder);
      }
      folder.branches.push(branch);
      parent = folder;
    }
    parent.children.push({ type: 'branch', label, branch });
  }

  return foldSingleItemFolders(root.children);
}
